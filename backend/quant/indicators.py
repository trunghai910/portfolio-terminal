from __future__ import annotations

import datetime as dt
import numpy as np
import polars as pl


def compute_ma_crossover_signals(
    prices_full: pl.DataFrame,
    tickers: list[str],
    weights: np.ndarray,
    start_date: dt.date,
    fast_window: int = 20,
    slow_window: int = 50,
) -> dict:
    """
    Vectorized Polars moving-average crossover signal engine (MA20 > MA50).
    Replaces the article's slow per-ticker yf.download() loop inside the Strategy Engine.
    Computes on full warm-up history, then slices strictly to >= start_date.
    """
    signal_exprs = []
    for t in tickers:
        ma_fast = pl.col(t).rolling_mean(window_size=fast_window)
        ma_slow = pl.col(t).rolling_mean(window_size=slow_window)
        signal_exprs.append(
            pl.when(ma_fast.is_not_null() & ma_slow.is_not_null())
            .then((ma_fast > ma_slow).cast(pl.Int8))
            .otherwise(None)
            .alias(t)
        )

    sig_df = (
        prices_full.select(["date"] + signal_exprs)
        .filter(pl.col("date") >= start_date)
        .drop_nulls(subset=tickers)
    )

    if sig_df.is_empty():
        return {
            "current_signal": "HOLD",
            "latest_score": 0.5,
            "dates": [],
            "portfolio_signal_series": [],
            "recent_rows": [],
        }

    sig_matrix = sig_df.select(tickers).to_numpy().astype(float)
    # Weight-adjusted portfolio signal score (more accurate than unweighted mean when weights differ)
    weighted_scores = sig_matrix @ weights
    dates = [d.isoformat() for d in sig_df["date"].to_list()]

    latest_score = float(weighted_scores[-1])
    if latest_score > 0.55:
        current_signal = "BUY"
    elif latest_score < 0.45:
        current_signal = "SELL"
    else:
        current_signal = "HOLD"

    recent_n = min(20, len(dates))
    recent_rows = []
    for idx in range(len(dates) - recent_n, len(dates)):
        row = {"date": dates[idx], "score": round(float(weighted_scores[idx]), 4)}
        for j, t in enumerate(tickers):
            row[t] = int(sig_matrix[idx, j])
        recent_rows.append(row)

    return {
        "current_signal": current_signal,
        "latest_score": round(latest_score, 4),
        "dates": dates,
        "portfolio_signal_series": [round(float(x), 4) for x in weighted_scores],
        "recent_rows": recent_rows,
    }


def compute_true_12_1_momentum_series(
    spy_prices_full: np.ndarray,
    skip_days: int = 21,
    lookback_days: int = 252,
) -> np.ndarray:
    """
    Computes true 12-1 Month Momentum proxy: P(t - 21) / P(t - 252) - 1.
    Fixes the article's mislabeled 12-day return ('spy_aligned.pct_change(12)').
    Falls back gracefully to 63-5 momentum if total history is shorter than 252 sessions.
    """
    n = len(spy_prices_full)
    mom = np.full(n, np.nan, dtype=float)

    eff_lookback = lookback_days if n > lookback_days + 5 else max(21, n // 3)
    eff_skip = skip_days if eff_lookback > skip_days + 5 else 0

    for t in range(eff_lookback, n):
        p_prev = spy_prices_full[t - eff_lookback]
        p_recent = spy_prices_full[t - eff_skip]
        if np.isfinite(p_prev) and np.isfinite(p_recent) and p_prev > 0:
            mom[t] = (p_recent / p_prev) - 1.0
    return mom
