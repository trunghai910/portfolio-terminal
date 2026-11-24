from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from config.settings import (
    REGIME_VOL_QUANTILE_LEVEL,
    REGIME_VOL_QUANTILE_WINDOW,
    ROLLING_VOL_WINDOW,
    TRADING_DAYS_PER_YEAR,
)


def compute_causal_regime(
    spy_prices_full: np.ndarray,
    vix_prices_full: np.ndarray | None = None,
    vol_quantile_window: int = REGIME_VOL_QUANTILE_WINDOW,
    vol_quantile_level: float = REGIME_VOL_QUANTILE_LEVEL,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Unified, strictly causal Market Regime Detection Engine (ZERO Look-Ahead Bias).

    Signals (all strictly observable at close of day t):
      - Trend: SPY MA50 > SPY MA200 (falls back to MA15 > MA45 if history < 205 days).
      - Momentum: SPY 63-day (1-quarter) return > 0.
      - Realized Volatility: SPY 20D annualized vol < rolling 252D 70th percentile.
      - Implied Volatility (if ^VIX available): ^VIX < 20.
    """
    prices = np.asarray(spy_prices_full, dtype=float)
    n = len(prices)
    scores = np.full(n, np.nan, dtype=float)
    states = np.full(n, "NEUTRAL", dtype=object)

    if n < 30:
        return scores, states

    # 1. Daily returns & vectorized 20D rolling annualized volatility
    spy_ret = np.full(n, np.nan, dtype=float)
    spy_ret[1:] = (prices[1:] / prices[:-1]) - 1.0

    vol_20 = np.full(n, np.nan, dtype=float)
    if n > ROLLING_VOL_WINDOW:
        ret_windows = sliding_window_view(spy_ret[1:], ROLLING_VOL_WINDOW)
        finite_win = np.all(np.isfinite(ret_windows), axis=1)
        win_stds = np.std(ret_windows, axis=1, ddof=1) * np.sqrt(TRADING_DAYS_PER_YEAR)
        vol_20[ROLLING_VOL_WINDOW:] = np.where(finite_win, win_stds, np.nan)

    # 2. Vectorized moving averages (MA50 & MA200)
    use_long_ma = n >= 205
    fast_w, slow_w = (50, 200) if use_long_ma else (15, 45)

    ma_fast = np.full(n, np.nan, dtype=float)
    ma_slow = np.full(n, np.nan, dtype=float)
    ma_fast[fast_w - 1 :] = np.mean(sliding_window_view(prices, fast_w), axis=1)
    ma_slow[slow_w - 1 :] = np.mean(sliding_window_view(prices, slow_w), axis=1)

    # 3. Medium-term Momentum (63D ~ 3 months; less whipsaw than 12D)
    mom_w = 63 if n > 70 else 12
    mom = np.full(n, np.nan, dtype=float)
    mom[mom_w:] = (prices[mom_w:] / prices[:-mom_w]) - 1.0

    # 4. Strictly backward-looking volatility threshold & composite score
    for t in range(slow_w - 1, n):
        components: list[float] = []

        if np.isfinite(ma_fast[t]) and np.isfinite(ma_slow[t]):
            components.append(1.0 if ma_fast[t] > ma_slow[t] else 0.0)

        if np.isfinite(mom[t]):
            components.append(1.0 if mom[t] > 0.0 else 0.0)

        if np.isfinite(vol_20[t]):
            start_q = max(0, t - vol_quantile_window + 1)
            past_vols = vol_20[start_q : t + 1]
            past_vols = past_vols[np.isfinite(past_vols)]
            if len(past_vols) >= 20:
                threshold = float(np.quantile(past_vols, vol_quantile_level))
                components.append(1.0 if vol_20[t] < threshold else 0.0)

        if vix_prices_full is not None and t < len(vix_prices_full) and np.isfinite(vix_prices_full[t]):
            components.append(1.0 if vix_prices_full[t] < 20.0 else 0.0)

        if components:
            score = float(np.mean(components))
            scores[t] = score
            if score >= 0.70:
                states[t] = "BULL"
            elif score <= 0.35:
                states[t] = "BEAR"
            else:
                states[t] = "NEUTRAL"

    return scores, states
