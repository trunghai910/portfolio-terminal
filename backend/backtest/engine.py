from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import numpy as np

from config.settings import MIN_OBS_FOR_OPTIMIZATION, TRADING_DAYS_PER_YEAR
from quant.optimizer import run_optimizer


@dataclass
class BacktestResult:
    gross_returns: np.ndarray
    net_returns: np.ndarray
    gross_equity: np.ndarray
    net_equity: np.ndarray
    daily_turnover: np.ndarray
    annualized_turnover_pct: float
    total_cost_drag_pct: float


def _is_rebalance_day(
    dates: list[dt.date],
    idx: int,
    frequency: str,
) -> bool:
    if idx == 0:
        return True
    if frequency == "NONE":
        return False
    prev_d, curr_d = dates[idx - 1], dates[idx]
    if frequency == "M":
        return curr_d.month != prev_d.month
    if frequency == "Q":
        return (curr_d.month - 1) // 3 != (prev_d.month - 1) // 3
    if frequency == "Y":
        return curr_d.year != prev_d.year
    return False


def simulate_static_portfolio(
    eval_dates: list[dt.date],
    eval_returns_matrix: np.ndarray,
    target_weights: np.ndarray,
    rebalance_frequency: str = "M",
    tx_cost_bps: float = 5.0,
    slippage_bps: float = 5.0,
) -> BacktestResult:
    """
    Simulates a user-defined portfolio WITH realistic weight drift between rebalance dates
    and explicit transaction costs + slippage (replacing the article's free daily rebalancing).
    """
    n_days, n_assets = eval_returns_matrix.shape
    cost_rate = (tx_cost_bps + slippage_bps) / 10000.0

    gross_ret = np.zeros(n_days, dtype=float)
    net_ret = np.zeros(n_days, dtype=float)
    turnovers = np.zeros(n_days, dtype=float)

    current_w = target_weights.copy()

    for t in range(n_days):
        turnover = 0.0
        if t == 0:
            # Initial portfolio construction cost
            turnover = float(np.sum(np.abs(target_weights)))
            current_w = target_weights.copy()
        elif _is_rebalance_day(eval_dates, t, rebalance_frequency):
            turnover = float(np.sum(np.abs(target_weights - current_w)))
            current_w = target_weights.copy()

        r_assets = eval_returns_matrix[t]
        day_gross = float(np.dot(current_w, r_assets))
        day_cost = turnover * cost_rate
        day_net = day_gross - day_cost

        gross_ret[t] = day_gross
        net_ret[t] = day_net
        turnovers[t] = turnover

        # Update drifted weights at close of day t
        denom = 1.0 + day_gross
        if denom > 1e-9:
            current_w = current_w * (1.0 + r_assets) / denom

    gross_eq = np.cumprod(1.0 + gross_ret)
    net_eq = np.cumprod(1.0 + net_ret)
    ann_turnover = float(np.mean(turnovers) * TRADING_DAYS_PER_YEAR * 100.0) if n_days > 0 else 0.0
    cost_drag = float((gross_eq[-1] - net_eq[-1]) * 100.0) if n_days > 0 else 0.0

    return BacktestResult(
        gross_returns=gross_ret,
        net_returns=net_ret,
        gross_equity=gross_eq,
        net_equity=net_eq,
        daily_turnover=turnovers,
        annualized_turnover_pct=round(ann_turnover, 2),
        total_cost_drag_pct=round(cost_drag, 2),
    )


def run_walk_forward_regime_backtest(
    full_dates: list[dt.date],
    full_returns_matrix: np.ndarray,
    full_regime_states: np.ndarray,
    eval_start_idx: int,
    optimization_method: str = "max_sharpe_lw",
    risk_free_rate: float | np.ndarray = 0.04,
    max_weight: float = 0.50,
    lookback_days: int = 252,
    rebalance_frequency: str = "M",
    tx_cost_bps: float = 5.0,
    slippage_bps: float = 5.0,
) -> BacktestResult:
    """
    Strictly Causal Walk-Forward Regime-Switching Backtest Engine:
      1. Zero Look-Ahead Bias: At day t, the active regime is taken from day (t - 1) close
         (1-day execution lag), and Bull weights are optimized using ONLY historical returns
         and the causal risk-free rate strictly prior to day t.
      2. Time-Varying Bear Cash Yield: In BEAR regime, 100% cash earns the exact daily
         Risk-Free Rate `rf_daily_arr[t]` (e.g. lagged ^IRX) instead of 0% or a static terminal rate.
      3. Realistic Drift & Costs: Tracks daily drifted weights and charges (tx_cost + slippage)
         on exact portfolio turnover whenever rebalancing or regime switching occurs.
      4. Aligned Lengths Guaranteed: Iterates directly on pre-aligned `full_returns_matrix`
         and `full_regime_states`, eliminating the article's `IndexError` & date-shift bug.
    """
    total_len, n_assets = full_returns_matrix.shape
    eval_len = total_len - eval_start_idx
    if eval_len <= 0:
        empty = np.array([], dtype=float)
        return BacktestResult(empty, empty, empty, empty, empty, 0.0, 0.0)

    if isinstance(risk_free_rate, np.ndarray):
        rf_daily_arr = np.asarray(risk_free_rate, dtype=float)
        if len(rf_daily_arr) != total_len:
            raise ValueError(
                f"risk_free_rate array length ({len(rf_daily_arr)}) must match full_dates ({total_len})."
            )
    else:
        rf_daily_arr = np.full(total_len, float(risk_free_rate) / TRADING_DAYS_PER_YEAR, dtype=float)

    cost_rate = (tx_cost_bps + slippage_bps) / 10000.0
    eq_weights = np.ones(n_assets, dtype=float) / n_assets
    eval_dates = full_dates[eval_start_idx:]

    gross_ret = np.zeros(eval_len, dtype=float)
    net_ret = np.zeros(eval_len, dtype=float)
    turnovers = np.zeros(eval_len, dtype=float)

    current_w = np.zeros(n_assets, dtype=float)  # starts in cash prior to day 0
    cached_bull_w = eq_weights.copy()
    prev_regime = None

    for k in range(eval_len):
        t = eval_start_idx + k

        # Strictly causal 1-day lag: signal observed at close of (t - 1) executes on day t
        signal_idx = max(0, t - 1)
        active_regime = str(full_regime_states[signal_idx])

        is_rebal = _is_rebalance_day(eval_dates, k, rebalance_frequency)
        regime_changed = (prev_regime is not None) and (active_regime != prev_regime)

        # Re-estimate Bull optimal weights ONLY on rebalance day or first entry into BULL
        if is_rebal or (active_regime == "BULL" and prev_regime != "BULL"):
            hist_start = max(0, t - lookback_days)
            hist_slice = full_returns_matrix[hist_start:t]
            if len(hist_slice) >= MIN_OBS_FOR_OPTIMIZATION:
                causal_rf_ann = float(rf_daily_arr[signal_idx] * TRADING_DAYS_PER_YEAR)
                cached_bull_w, _, _ = run_optimizer(
                    hist_slice,
                    method=optimization_method,
                    risk_free_rate=causal_rf_ann,
                    max_weight=max_weight,
                )
            else:
                cached_bull_w = eq_weights.copy()

        # Determine target weights if rebalancing, initial day, or regime switch occurred
        turnover = 0.0
        if k == 0 or is_rebal or regime_changed:
            if active_regime == "BULL":
                target_w = cached_bull_w.copy()
            elif active_regime == "BEAR":
                target_w = np.zeros(n_assets, dtype=float)
            else:
                target_w = eq_weights.copy()

            # Turnover includes risky asset trades (cash leg adjusts automatically)
            turnover = float(np.sum(np.abs(target_w - current_w)))
            current_w = target_w

        prev_regime = active_regime

        # Compute day return (invested equity + cash allocation earning day t's Rf)
        r_assets = full_returns_matrix[t]
        cash_weight = max(0.0, 1.0 - float(np.sum(current_w)))
        day_gross = float(np.dot(current_w, r_assets)) + cash_weight * float(rf_daily_arr[t])
        day_cost = turnover * cost_rate
        day_net = day_gross - day_cost

        gross_ret[k] = day_gross
        net_ret[k] = day_net
        turnovers[k] = turnover

        # Drift risky weights at end of day t
        denom = 1.0 + day_gross
        if denom > 1e-9 and np.sum(current_w) > 0:
            current_w = current_w * (1.0 + r_assets) / denom

    gross_eq = np.cumprod(1.0 + gross_ret)
    net_eq = np.cumprod(1.0 + net_ret)
    ann_turnover = float(np.mean(turnovers) * TRADING_DAYS_PER_YEAR * 100.0)
    cost_drag = float((gross_eq[-1] - net_eq[-1]) * 100.0)

    return BacktestResult(
        gross_returns=gross_ret,
        net_returns=net_ret,
        gross_equity=gross_eq,
        net_equity=net_eq,
        daily_turnover=turnovers,
        annualized_turnover_pct=round(ann_turnover, 2),
        total_cost_drag_pct=round(cost_drag, 2),
    )