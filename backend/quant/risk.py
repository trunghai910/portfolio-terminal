from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from config.settings import ROLLING_BETA_WINDOW, ROLLING_VOL_WINDOW, TRADING_DAYS_PER_YEAR


def compute_drawdown(returns: np.ndarray) -> np.ndarray:
    cum = np.cumprod(1.0 + returns)
    peak = np.maximum.accumulate(cum)
    return (cum / peak) - 1.0


def compute_rolling_volatility(
    returns: np.ndarray,
    window: int = ROLLING_VOL_WINDOW,
) -> np.ndarray:
    n = len(returns)
    out = np.full(n, np.nan, dtype=float)
    if n < window or window < 2:
        return out
    windows = sliding_window_view(np.asarray(returns, dtype=float), window)
    out[window - 1 :] = np.std(windows, axis=1, ddof=1) * np.sqrt(TRADING_DAYS_PER_YEAR)
    return out


def compute_rolling_beta(
    port_returns: np.ndarray,
    bench_returns: np.ndarray,
    window: int = ROLLING_BETA_WINDOW,
) -> np.ndarray:
    n = len(port_returns)
    out = np.full(n, np.nan, dtype=float)
    if n < window or window < 2:
        return out

    p_win = sliding_window_view(np.asarray(port_returns, dtype=float), window)
    b_win = sliding_window_view(np.asarray(bench_returns, dtype=float), window)

    p_centered = p_win - np.mean(p_win, axis=1, keepdims=True)
    b_centered = b_win - np.mean(b_win, axis=1, keepdims=True)

    dof = float(window - 1)
    var_b = np.sum(b_centered * b_centered, axis=1) / dof
    cov_pb = np.sum(p_centered * b_centered, axis=1) / dof

    valid = np.isfinite(var_b) & np.isfinite(cov_pb) & (var_b > 1e-12)
    betas = np.full(len(var_b), np.nan, dtype=float)
    betas[valid] = cov_pb[valid] / var_b[valid]
    out[window - 1 :] = betas
    return out


def compute_rolling_correlation(
    series_a: np.ndarray,
    series_b: np.ndarray,
    window: int = 20,
) -> np.ndarray:
    n = len(series_a)
    out = np.full(n, np.nan, dtype=float)
    if n < window or window < 2:
        return out

    a_win = sliding_window_view(np.asarray(series_a, dtype=float), window)
    b_win = sliding_window_view(np.asarray(series_b, dtype=float), window)
    valid_mask = np.isfinite(a_win) & np.isfinite(b_win)
    counts = np.sum(valid_mask, axis=1)
    min_valid = max(5, window // 2)

    # Masked vectorized Pearson correlation per rolling window
    a_safe = np.where(valid_mask, a_win, 0.0)
    b_safe = np.where(valid_mask, b_win, 0.0)
    denom_n = np.maximum(counts, 1).astype(float)

    mean_a = np.sum(a_safe, axis=1, keepdims=True) / denom_n[:, None]
    mean_b = np.sum(b_safe, axis=1, keepdims=True) / denom_n[:, None]

    da = np.where(valid_mask, a_win - mean_a, 0.0)
    db = np.where(valid_mask, b_win - mean_b, 0.0)

    ss_a = np.sum(da * da, axis=1)
    ss_b = np.sum(db * db, axis=1)
    cov_ab = np.sum(da * db, axis=1)

    dof = np.maximum(counts - 1, 1).astype(float)
    std_a = np.sqrt(ss_a / dof)
    std_b = np.sqrt(ss_b / dof)

    ok = (counts >= min_valid) & (std_a > 1e-12) & (std_b > 1e-12)
    corrs = np.full(len(counts), np.nan, dtype=float)
    corrs[ok] = cov_ab[ok] / np.sqrt(ss_a[ok] * ss_b[ok])
    out[window - 1 :] = np.clip(corrs, -1.0, 1.0)
    return out


def compute_var_cvar(returns: np.ndarray, confidence: float = 0.95) -> tuple[float, float]:
    """Historical daily Value-at-Risk (VaR) and Conditional VaR (Expected Shortfall) in %."""
    if len(returns) == 0:
        return 0.0, 0.0
    alpha = 1.0 - confidence
    var_val = float(np.quantile(returns, alpha))
    tail = returns[returns <= var_val]
    cvar_val = float(np.mean(tail)) if len(tail) > 0 else var_val
    return var_val * 100.0, cvar_val * 100.0


def compute_correlation_matrix(returns_matrix: np.ndarray, tickers: list[str]) -> dict:
    if returns_matrix.shape[1] == 1:
        return {"tickers": tickers, "values": [[1.0]]}
    corr = np.corrcoef(returns_matrix, rowvar=False)
    corr = np.nan_to_num(corr, nan=0.0)
    return {
        "tickers": tickers,
        "values": [[round(float(v), 4) for v in row] for row in corr],
    }
