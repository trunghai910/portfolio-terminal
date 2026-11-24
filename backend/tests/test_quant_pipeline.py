from __future__ import annotations

import datetime as dt

import numpy as np

from backtest.engine import run_walk_forward_regime_backtest, simulate_static_portfolio
from backtest.metrics import compute_performance_summary
from quant.factors import compute_multivariate_factor_analysis
from quant.optimizer import generate_monte_carlo_frontier, optimize_hrp, optimize_max_sharpe_lw
from quant.regime import compute_causal_regime
from quant.risk import (
    compute_rolling_beta,
    compute_rolling_correlation,
    compute_rolling_volatility,
)


def _synthetic_dates(n: int, start: dt.date = dt.date(2022, 1, 3)) -> list[dt.date]:
    dates = []
    curr = start
    while len(dates) < n:
        if curr.weekday() < 5:
            dates.append(curr)
        curr += dt.timedelta(days=1)
    return dates


def test_causal_regime_has_zero_lookahead_bias():
    """
    Modifying future prices after index T MUST NOT alter regime_scores[<= T].
    This directly proves full-sample quantile look-ahead bias is eliminated.
    """
    rng = np.random.default_rng(123)
    rets = rng.normal(0.0005, 0.012, size=600)
    prices_a = 100.0 * np.cumprod(1.0 + rets)
    prices_b = prices_a.copy()
    # Inject massive crash in the future (after t = 400)
    prices_b[401:] *= np.linspace(1.0, 0.25, len(prices_b) - 401)

    scores_a, states_a = compute_causal_regime(prices_a)
    scores_b, states_b = compute_causal_regime(prices_b)

    np.testing.assert_allclose(scores_a[:401], scores_b[:401], equal_nan=True)
    assert list(states_a[:401]) == list(states_b[:401])


def test_walk_forward_backtest_has_zero_lookahead_and_deducts_costs():
    """
    1. Changing future returns after day K must not alter net_returns before K.
    2. Net equity must be strictly <= Gross equity when tx_cost_bps > 0.
    """
    rng = np.random.default_rng(7)
    n_days, n_assets = 520, 4
    dates = _synthetic_dates(n_days)
    rets_a = rng.normal(0.0006, 0.015, size=(n_days, n_assets))
    spy_prices = 400.0 * np.cumprod(1.0 + rng.normal(0.0004, 0.01, size=n_days))
    _, regimes = compute_causal_regime(spy_prices)

    bt_a = run_walk_forward_regime_backtest(
        full_dates=dates,
        full_returns_matrix=rets_a,
        full_regime_states=regimes,
        eval_start_idx=260,
        optimization_method="max_sharpe_lw",
        tx_cost_bps=10.0,
        slippage_bps=5.0,
    )

    rets_b = rets_a.copy()
    rets_b[400:] = -0.05  # Future shock at index 400 (eval index 140)
    bt_b = run_walk_forward_regime_backtest(
        full_dates=dates,
        full_returns_matrix=rets_b,
        full_regime_states=regimes,
        eval_start_idx=260,
        optimization_method="max_sharpe_lw",
        tx_cost_bps=10.0,
        slippage_bps=5.0,
    )

    np.testing.assert_allclose(bt_a.net_returns[:140], bt_b.net_returns[:140], atol=1e-12)
    assert bt_a.net_equity[-1] < bt_a.gross_equity[-1]
    assert bt_a.total_cost_drag_pct > 0.0


def test_optimizers_respect_constraints_including_single_asset():
    rng = np.random.default_rng(99)
    r1 = rng.normal(0.001, 0.02, size=(200, 1))
    w1, _, _ = optimize_max_sharpe_lw(r1, max_weight=0.5)
    np.testing.assert_allclose(w1, [1.0])

    r4 = rng.normal([0.001, 0.0008, 0.0005, 0.0003], 0.015, size=(300, 4))
    w_lw, mean_ann, cov_ann = optimize_max_sharpe_lw(r4, risk_free_rate=0.04, max_weight=0.5)
    assert abs(np.sum(w_lw) - 1.0) < 1e-6
    assert np.all(w_lw >= -1e-9) and np.all(w_lw <= 0.500001)

    w_hrp, _, _ = optimize_hrp(r4, max_weight=0.5)
    assert abs(np.sum(w_hrp) - 1.0) < 1e-6
    assert np.all(w_hrp >= 0.0)

    mc = generate_monte_carlo_frontier(mean_ann, cov_ann, n_samples=500)
    assert len(mc["mc_sharpe"]) == 500


def test_multivariate_factors_and_static_drift():
    rng = np.random.default_rng(42)
    n = 260
    dates = _synthetic_dates(n)
    spy = rng.normal(0.0004, 0.01, size=n)
    qqq = spy + rng.normal(0.0002, 0.005, size=n)
    iwm = spy + rng.normal(-0.0001, 0.006, size=n)
    vix = -3.0 * spy + rng.normal(0.0, 0.04, size=n)

    assets = np.column_stack([
        1.2 * spy + 0.5 * (qqq - spy) + 0.0002 + rng.normal(0, 0.002, size=n),
        0.9 * spy + rng.normal(0, 0.003, size=n),
    ])
    bt = simulate_static_portfolio(dates, assets, np.array([0.6, 0.4]), rebalance_frequency="M")
    perf = compute_performance_summary(bt.net_returns, risk_free_rate=0.04)
    assert "sharpe_ratio" in perf and "sortino_ratio" in perf

    fac = compute_multivariate_factor_analysis(
        port_returns=bt.net_returns,
        spy_returns=spy,
        qqq_returns=qqq,
        iwm_returns=iwm,
        vix_returns=vix,
        asset_returns_matrix=assets,
        tickers=["AAA", "BBB"],
        eval_dates=[d.isoformat() for d in dates],
        risk_free_rate=0.04,
    )
    assert fac["r_squared"] > 0.85
    assert len(fac["factor_loadings"]) == 4


def test_vectorized_rolling_risk_matches_exact_definitions():
    rng = np.random.default_rng(2026)
    n = 80
    window = 20
    p = rng.normal(0.0005, 0.015, size=n)
    b = rng.normal(0.0004, 0.01, size=n)

    rvol = compute_rolling_volatility(p, window=window)
    rbeta = compute_rolling_beta(p, b, window=window)
    rcorr = compute_rolling_correlation(p, b, window=window)

    assert np.all(np.isnan(rvol[: window - 1]))
    assert np.all(np.isnan(rbeta[: window - 1]))
    assert np.all(np.isnan(rcorr[: window - 1]))

    for i in range(window - 1, n):
        pw = p[i - window + 1 : i + 1]
        bw = b[i - window + 1 : i + 1]
        np.testing.assert_allclose(rvol[i], np.std(pw, ddof=1) * np.sqrt(252), rtol=1e-12)
        np.testing.assert_allclose(rbeta[i], np.cov(pw, bw, ddof=1)[0, 1] / np.var(bw, ddof=1), rtol=1e-12)
        np.testing.assert_allclose(rcorr[i], np.corrcoef(pw, bw)[0, 1], rtol=1e-12)
