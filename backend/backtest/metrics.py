from __future__ import annotations

import numpy as np

from config.settings import TRADING_DAYS_PER_YEAR
from quant.risk import compute_drawdown


def compute_performance_summary(
    returns: np.ndarray,
    risk_free_rate: float | np.ndarray = 0.04,
) -> dict:
    """
    Computes institutional-grade risk-adjusted performance metrics.
    Supports either:
      - scalar `risk_free_rate` (annualized decimal, e.g., 0.04)
      - 1D array `risk_free_rate` (daily risk-free returns aligned 1-to-1 with `returns`)
    """
    n = len(returns)
    if n == 0:
        return {
            "total_return_pct": 0.0,
            "cagr_pct": 0.0,
            "annual_volatility_pct": 0.0,
            "sharpe_ratio": 0.0,
            "sortino_ratio": 0.0,
            "max_drawdown_pct": 0.0,
            "calmar_ratio": 0.0,
        }

    cum = np.cumprod(1.0 + returns)
    total_ret = float(cum[-1] - 1.0)
    years = max(n / TRADING_DAYS_PER_YEAR, 1.0 / TRADING_DAYS_PER_YEAR)
    cagr = float((cum[-1] ** (1.0 / years)) - 1.0) if cum[-1] > 0 else -1.0

    if isinstance(risk_free_rate, np.ndarray):
        rf_daily = np.asarray(risk_free_rate, dtype=float)
        if len(rf_daily) != n:
            raise ValueError(f"risk_free_rate array length ({len(rf_daily)}) must match returns ({n}).")
    else:
        rf_daily = float(risk_free_rate) / TRADING_DAYS_PER_YEAR

    excess = returns - rf_daily

    ann_vol = float(np.std(returns, ddof=1) * np.sqrt(TRADING_DAYS_PER_YEAR)) if n > 1 else 0.0
    sharpe = (
        float(np.mean(excess) / np.std(returns, ddof=1) * np.sqrt(TRADING_DAYS_PER_YEAR))
        if n > 1 and np.std(returns, ddof=1) > 1e-12
        else 0.0
    )

    downside = np.minimum(excess, 0.0)
    downside_std = float(np.sqrt(np.mean(downside ** 2)) * np.sqrt(TRADING_DAYS_PER_YEAR))
    sortino = (
        float((np.mean(excess) * TRADING_DAYS_PER_YEAR) / downside_std)
        if downside_std > 1e-12
        else 0.0
    )

    dd = compute_drawdown(returns)
    max_dd = float(np.min(dd))
    calmar = cagr / abs(max_dd) if abs(max_dd) > 1e-9 else 0.0

    return {
        "total_return_pct": round(total_ret * 100.0, 2),
        "cagr_pct": round(cagr * 100.0, 2),
        "annual_volatility_pct": round(ann_vol * 100.0, 2),
        "sharpe_ratio": round(sharpe, 3),
        "sortino_ratio": round(sortino, 3),
        "max_drawdown_pct": round(max_dd * 100.0, 2),
        "calmar_ratio": round(calmar, 3),
    }