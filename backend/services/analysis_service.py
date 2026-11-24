from __future__ import annotations

import datetime as dt
from typing import cast

import numpy as np
import polars as pl

from app.schemas import (
    AllocationItem,
    AnalyzeRequest,
    AnalyzeResponse,
    AssetPoint,
    BacktestSection,
    BacktestSummary,
    CacheClearResponse,
    CacheStatusResponse,
    CorrelationMatrix,
    EfficientFrontier,
    EquityCurves,
    FactorsSection,
    MetaInfo,
    PortfolioKPIs,
    PortfolioPoint,
    PortfolioSection,
    RecentRegimeRow,
    RegimeSeries,
    RegimeState,
    RiskFreeSource,
    RiskSection,
    SignalsSection,
)
from backtest.engine import BacktestResult, run_walk_forward_regime_backtest, simulate_static_portfolio
from backtest.metrics import compute_performance_summary
from config.settings import (
    BENCHMARK_TICKER,
    DEFAULT_RISK_FREE_RATE,
    FACTOR_TICKERS,
    RISK_FREE_TICKER,
    TRADING_DAYS_PER_YEAR,
)
from data.loader import MarketDataStore
from data.processor import PreparedMarketData, prepare_market_data
from quant.factors import compute_multivariate_factor_analysis
from quant.indicators import compute_ma_crossover_signals, compute_true_12_1_momentum_series
from quant.optimizer import generate_monte_carlo_frontier, portfolio_stats, run_optimizer
from quant.regime import compute_causal_regime
from quant.risk import (
    compute_correlation_matrix,
    compute_drawdown,
    compute_rolling_beta,
    compute_rolling_correlation,
    compute_rolling_volatility,
    compute_var_cvar,
)


def _round_series(values: np.ndarray, decimals: int = 4, scale: float = 1.0) -> list[float]:
    return [round(float(x * scale), decimals) for x in values]


def _round_nullable_series(
    values: np.ndarray,
    decimals: int = 3,
    scale: float = 1.0,
) -> list[float | None]:
    return [None if not np.isfinite(x) else round(float(x * scale), decimals) for x in values]


def resolve_risk_free_series(
    wide_prices: pl.DataFrame,
    full_dates: list[dt.date],
    eval_start_idx: int,
    override: float | None,
) -> tuple[float, float, RiskFreeSource, np.ndarray, np.ndarray]:
    """
    Builds a strictly causal daily risk-free return series Rf_t = IRX_{t-1} / (100 * 252).
    Returns:
      (mean_eval_annual_rf, latest_eval_annual_rf, source_code, full_rf_daily, eval_rf_daily)
    """
    n_full = len(full_dates)
    if override is not None:
        val = float(override)
        full_rf_daily = np.full(n_full, val / TRADING_DAYS_PER_YEAR, dtype=float)
        eval_rf_daily = full_rf_daily[eval_start_idx:]
        return round(val, 4), round(val, 4), "user_override", full_rf_daily, eval_rf_daily

    if RISK_FREE_TICKER in wide_prices.columns and not wide_prices[RISK_FREE_TICKER].drop_nulls().is_empty():
        irx_df = (
            pl.DataFrame({"date": full_dates})
            .join(wide_prices.select(["date", RISK_FREE_TICKER]), on="date", how="left")
            .sort("date")
            .with_columns(
                pl.col(RISK_FREE_TICKER)
                .cast(pl.Float64)
                .forward_fill()
                .backward_fill()
                .alias("irx")
            )
        )
        irx_arr = irx_df["irx"].to_numpy()
        if np.all(np.isfinite(irx_arr)):
            # 1-day execution lag: yield observed at close of (t - 1) applies on day t
            lagged_irx = np.empty_like(irx_arr)
            lagged_irx[0] = irx_arr[0]
            lagged_irx[1:] = irx_arr[:-1]
            lagged_irx = np.clip(lagged_irx, 0.0, 25.0)

            full_rf_daily = (lagged_irx / 100.0) / TRADING_DAYS_PER_YEAR
            eval_rf_daily = full_rf_daily[eval_start_idx:]
            mean_ann = float(np.mean(eval_rf_daily) * TRADING_DAYS_PER_YEAR)
            latest_ann = float(eval_rf_daily[-1] * TRADING_DAYS_PER_YEAR)
            return round(mean_ann, 4), round(latest_ann, 4), "^IRX", full_rf_daily, eval_rf_daily

    full_rf_daily = np.full(n_full, DEFAULT_RISK_FREE_RATE / TRADING_DAYS_PER_YEAR, dtype=float)
    eval_rf_daily = full_rf_daily[eval_start_idx:]
    return DEFAULT_RISK_FREE_RATE, DEFAULT_RISK_FREE_RATE, "default", full_rf_daily, eval_rf_daily


def aligned_factor_return_series(
    benchmark_prices_full: pl.DataFrame,
    eval_dates: list[dt.date],
    ticker: str,
) -> np.ndarray | None:
    if ticker not in benchmark_prices_full.columns:
        return None
    df = (
        benchmark_prices_full.select(["date", pl.col(ticker).pct_change().alias("ret")])
        .join(pl.DataFrame({"date": eval_dates}), on="date", how="right")
        .sort("date")
    )
    arr = df["ret"].to_numpy()
    if np.all(np.isnan(arr)):
        return None
    return np.nan_to_num(arr, nan=0.0)


def _extract_regime_inputs(prepared: PreparedMarketData) -> tuple[np.ndarray, np.ndarray | None]:
    spy_vix_cols = ["date", BENCHMARK_TICKER] + (
        ["^VIX"] if "^VIX" in prepared.benchmark_prices_full.columns else []
    )
    regime_input_df = (
        pl.DataFrame({"date": prepared.full_dates})
        .join(prepared.benchmark_prices_full.select(spy_vix_cols), on="date", how="left")
        .sort("date")
    )
    spy_prices_full = regime_input_df[BENCHMARK_TICKER].forward_fill().to_numpy()
    vix_prices_full = (
        regime_input_df["^VIX"].forward_fill().to_numpy()
        if "^VIX" in regime_input_df.columns
        else None
    )
    return spy_prices_full, vix_prices_full


class PortfolioAnalysisService:
    """
    Application service orchestrating the end-to-end quantitative portfolio pipeline:
      1. Cache-aside market data loading & warm-up alignment
      2. Static portfolio simulation with drift & transaction costs
      3. Robust optimization (Ledoit-Wolf Max Sharpe / HRP) & Monte Carlo frontier
      4. Causal market regime detection & Walk-Forward regime-switching backtest
      5. Risk analytics, 12-1 momentum exposure, multivariate OLS factors & MA signals
    """

    def __init__(self, store: MarketDataStore) -> None:
        self.store = store

    def analyze(self, req: AnalyzeRequest) -> AnalyzeResponse:
        try:
            start_dt = dt.date.fromisoformat(req.start_date)
            end_dt = dt.date.fromisoformat(req.end_date) if req.end_date else None
        except ValueError as exc:
            raise ValueError(f"Định dạng ngày không hợp lệ: {exc}") from exc

        all_tickers = list(dict.fromkeys(req.tickers + FACTOR_TICKERS + [RISK_FREE_TICKER]))
        wide_prices = self.store.fetch_prices_wide(all_tickers, start_date=start_dt, end_date=end_dt)

        prepared = prepare_market_data(
            wide_prices=wide_prices,
            requested_tickers=req.tickers,
            raw_weights=req.weights,
            start_date=start_dt,
            benchmark_ticker=BENCHMARK_TICKER,
        )

        rf_mean_ann, rf_latest_ann, rf_source, full_rf_daily, eval_rf_daily = resolve_risk_free_series(
            wide_prices=wide_prices,
            full_dates=prepared.full_dates,
            eval_start_idx=prepared.eval_start_idx,
            override=req.risk_free_rate,
        )
        eval_date_strs = [d.isoformat() for d in prepared.eval_dates]
        tickers = prepared.valid_tickers
        weights = prepared.normalized_weights

        # Static portfolio simulation & benchmark equity
        static_bt = simulate_static_portfolio(
            eval_dates=prepared.eval_dates,
            eval_returns_matrix=prepared.eval_returns_matrix,
            target_weights=weights,
            rebalance_frequency=req.rebalance_frequency,
            tx_cost_bps=req.tx_cost_bps,
            slippage_bps=req.slippage_bps,
        )
        port_ret_net = static_bt.net_returns
        spy_ret = prepared.eval_spy_returns
        spy_cum = np.cumprod(1.0 + spy_ret)

        # Robust in-sample reference optimization & Monte Carlo frontier
        opt_weights, mean_ann, cov_ann = run_optimizer(
            prepared.eval_returns_matrix,
            method=req.optimization_method,
            risk_free_rate=rf_mean_ann,
            max_weight=req.max_weight,
        )
        opt_ret, opt_vol, opt_sharpe = portfolio_stats(opt_weights, mean_ann, cov_ann, rf_mean_ann)
        curr_ret_est, curr_vol_est, curr_sharpe_est = portfolio_stats(weights, mean_ann, cov_ann, rf_mean_ann)
        opt_in_sample_cum = np.cumprod(1.0 + (prepared.eval_returns_matrix @ opt_weights))
        mc_frontier = generate_monte_carlo_frontier(mean_ann, cov_ann, risk_free_rate=rf_mean_ann)

        # Causal market regime detection & Walk-Forward backtest
        spy_prices_full, vix_prices_full = _extract_regime_inputs(prepared)
        regime_scores_full, regime_states_full = compute_causal_regime(spy_prices_full, vix_prices_full)

        wf_bt = run_walk_forward_regime_backtest(
            full_dates=prepared.full_dates,
            full_returns_matrix=prepared.full_returns_matrix,
            full_regime_states=regime_states_full,
            eval_start_idx=prepared.eval_start_idx,
            optimization_method=req.optimization_method,
            risk_free_rate=full_rf_daily,
            max_weight=req.max_weight,
            lookback_days=req.lookback_days,
            rebalance_frequency=req.rebalance_frequency,
            tx_cost_bps=req.tx_cost_bps,
            slippage_bps=req.slippage_bps,
        )

        eval_regime_scores = regime_scores_full[prepared.eval_start_idx :]
        eval_regime_states = regime_states_full[prepared.eval_start_idx :]
        eval_spy_prices = spy_prices_full[prepared.eval_start_idx :]

        latest_regime = cast(RegimeState, str(eval_regime_states[-1]))
        finite_scores = eval_regime_scores[np.isfinite(eval_regime_scores)]
        latest_regime_score = float(finite_scores[-1]) if len(finite_scores) > 0 else 0.5

        # Performance summaries
        port_perf = compute_performance_summary(port_ret_net, risk_free_rate=eval_rf_daily)
        spy_perf = compute_performance_summary(spy_ret, risk_free_rate=eval_rf_daily)
        wf_net_perf = compute_performance_summary(wf_bt.net_returns, risk_free_rate=eval_rf_daily)
        wf_gross_perf = compute_performance_summary(wf_bt.gross_returns, risk_free_rate=eval_rf_daily)

        # Risk & 12-1 Momentum exposure
        risk_section, var_95, cvar_95, latest_beta, latest_mom_exp = self._build_risk_section(
            eval_date_strs=eval_date_strs,
            eval_returns_matrix=prepared.eval_returns_matrix,
            tickers=tickers,
            port_ret_net=port_ret_net,
            spy_ret=spy_ret,
            spy_prices_full=spy_prices_full,
            eval_start_idx=prepared.eval_start_idx,
        )

        # Multivariate Factor Model
        factors_raw = compute_multivariate_factor_analysis(
            port_returns=port_ret_net,
            spy_returns=spy_ret,
            qqq_returns=aligned_factor_return_series(prepared.benchmark_prices_full, prepared.eval_dates, "QQQ"),
            iwm_returns=aligned_factor_return_series(prepared.benchmark_prices_full, prepared.eval_dates, "IWM"),
            vix_returns=aligned_factor_return_series(prepared.benchmark_prices_full, prepared.eval_dates, "^VIX"),
            asset_returns_matrix=prepared.eval_returns_matrix,
            tickers=tickers,
            eval_dates=eval_date_strs,
            risk_free_rate=eval_rf_daily,
        )
        factors_section = FactorsSection.model_validate(factors_raw)

        # Vectorized MA20/MA50 signals
        signals_raw = compute_ma_crossover_signals(
            prices_full=prepared.portfolio_prices_full,
            tickers=tickers,
            weights=weights,
            start_date=prepared.effective_start_date,
        )
        signals_section = SignalsSection.model_validate(signals_raw)

        kpis = PortfolioKPIs(
            total_return=port_perf["total_return_pct"],
            cagr=port_perf["cagr_pct"],
            spy_total_return=spy_perf["total_return_pct"],
            active_return=round(port_perf["total_return_pct"] - spy_perf["total_return_pct"], 2),
            annual_volatility=port_perf["annual_volatility_pct"],
            sharpe_ratio=port_perf["sharpe_ratio"],
            sortino_ratio=port_perf["sortino_ratio"],
            calmar_ratio=port_perf["calmar_ratio"],
            max_drawdown=port_perf["max_drawdown_pct"],
            var_95=round(var_95, 2),
            cvar_95=round(cvar_95, 2),
            rolling_beta_latest=round(latest_beta, 3),
            momentum_12_1_exposure=round(latest_mom_exp, 3),
            capm_alpha=factors_section.capm_alpha_annual_pct,
            treynor_ratio=factors_section.treynor_ratio,
            current_regime=latest_regime,
            current_regime_score=round(latest_regime_score, 3),
            optimized_return=round(opt_ret * 100.0, 2),
            optimized_volatility=round(opt_vol * 100.0, 2),
            optimized_sharpe=round(opt_sharpe, 3),
        )

        portfolio_section = self._build_portfolio_section(
            kpis=kpis,
            tickers=tickers,
            weights=weights,
            opt_weights=opt_weights,
            eval_date_strs=eval_date_strs,
            static_bt=static_bt,
            opt_in_sample_cum=opt_in_sample_cum,
            wf_bt=wf_bt,
            spy_cum=spy_cum,
            mc_frontier=mc_frontier,
            mean_ann=mean_ann,
            cov_ann=cov_ann,
            curr_stats=(curr_ret_est, curr_vol_est, curr_sharpe_est),
            opt_stats=(opt_ret, opt_vol, opt_sharpe),
        )

        backtest_section = self._build_backtest_section(
            eval_date_strs=eval_date_strs,
            wf_bt=wf_bt,
            static_bt=static_bt,
            spy_cum=spy_cum,
            wf_gross_perf=wf_gross_perf,
            wf_net_perf=wf_net_perf,
            port_perf=port_perf,
            eval_spy_prices=eval_spy_prices,
            eval_regime_scores=eval_regime_scores,
            eval_regime_states=eval_regime_states,
        )

        meta = MetaInfo(
            valid_tickers=tickers,
            invalid_tickers=prepared.invalid_tickers,
            warnings=prepared.warnings,
            requested_start_date=req.start_date,
            effective_start_date=prepared.effective_start_date.isoformat(),
            end_date=prepared.end_date.isoformat(),
            risk_free_rate=rf_mean_ann,
            risk_free_latest=rf_latest_ann,
            risk_free_source=rf_source,
            trading_days=len(eval_date_strs),
            optimization_method=req.optimization_method,
        )

        return AnalyzeResponse(
            meta=meta,
            portfolio=portfolio_section,
            risk=risk_section,
            signals=signals_section,
            backtest=backtest_section,
            factors=factors_section,
        )

    def get_cache_status(self) -> CacheStatusResponse:
        return CacheStatusResponse.model_validate(self.store.get_cache_status())

    def clear_cache(self) -> CacheClearResponse:
        self.store.clear_cache()
        return CacheClearResponse(status="cleared")

    @staticmethod
    def _build_portfolio_section(
        kpis: PortfolioKPIs,
        tickers: list[str],
        weights: np.ndarray,
        opt_weights: np.ndarray,
        eval_date_strs: list[str],
        static_bt: BacktestResult,
        opt_in_sample_cum: np.ndarray,
        wf_bt: BacktestResult,
        spy_cum: np.ndarray,
        mc_frontier: dict,
        mean_ann: np.ndarray,
        cov_ann: np.ndarray,
        curr_stats: tuple[float, float, float],
        opt_stats: tuple[float, float, float],
    ) -> PortfolioSection:
        asset_vols = np.sqrt(np.maximum(np.diag(cov_ann), 1e-12))
        asset_points = [
            AssetPoint(
                ticker=t,
                return_pct=round(float(mean_ann[i] * 100.0), 2),
                volatility_pct=round(float(asset_vols[i] * 100.0), 2),
            )
            for i, t in enumerate(tickers)
        ]

        return PortfolioSection(
            kpis=kpis,
            current_allocation=[
                AllocationItem(ticker=t, weight=round(float(w), 4)) for t, w in zip(tickers, weights)
            ],
            optimized_allocation=[
                AllocationItem(ticker=t, weight=round(float(w), 4)) for t, w in zip(tickers, opt_weights)
            ],
            equity_curves=EquityCurves(
                dates=eval_date_strs,
                current_portfolio=_round_series(static_bt.net_equity, 4),
                optimized_in_sample=_round_series(opt_in_sample_cum, 4),
                walk_forward_net=_round_series(wf_bt.net_equity, 4),
                spy=_round_series(spy_cum, 4),
            ),
            efficient_frontier=EfficientFrontier(
                mc_volatility=mc_frontier["mc_volatility"],
                mc_return=mc_frontier["mc_return"],
                mc_sharpe=mc_frontier["mc_sharpe"],
                assets=asset_points,
                current_point=PortfolioPoint(
                    return_pct=round(curr_stats[0] * 100.0, 2),
                    volatility_pct=round(curr_stats[1] * 100.0, 2),
                    sharpe=round(curr_stats[2], 3),
                ),
                optimal_point=PortfolioPoint(
                    return_pct=round(opt_stats[0] * 100.0, 2),
                    volatility_pct=round(opt_stats[1] * 100.0, 2),
                    sharpe=round(opt_stats[2], 3),
                ),
            ),
        )

    @staticmethod
    def _build_risk_section(
        eval_date_strs: list[str],
        eval_returns_matrix: np.ndarray,
        tickers: list[str],
        port_ret_net: np.ndarray,
        spy_ret: np.ndarray,
        spy_prices_full: np.ndarray,
        eval_start_idx: int,
    ) -> tuple[RiskSection, float, float, float, float]:
        var_95, cvar_95 = compute_var_cvar(port_ret_net, confidence=0.95)
        port_dd = compute_drawdown(port_ret_net)
        spy_dd = compute_drawdown(spy_ret)
        port_rvol = compute_rolling_volatility(port_ret_net)
        spy_rvol = compute_rolling_volatility(spy_ret)
        rolling_beta = compute_rolling_beta(port_ret_net, spy_ret)

        mom_12_1_full = compute_true_12_1_momentum_series(spy_prices_full)
        mom_12_1_eval = mom_12_1_full[eval_start_idx:]
        mom_corr = compute_rolling_correlation(port_ret_net, mom_12_1_eval, window=20)

        valid_rb_mask = np.isfinite(rolling_beta)
        latest_beta = float(rolling_beta[valid_rb_mask][-1]) if np.any(valid_rb_mask) else 1.0

        valid_mom_mask = np.isfinite(mom_corr)
        latest_mom_exp = float(mom_corr[valid_mom_mask][-1]) if np.any(valid_mom_mask) else 0.0

        corr_matrix = CorrelationMatrix.model_validate(
            compute_correlation_matrix(eval_returns_matrix, tickers)
        )

        section = RiskSection(
            correlation_matrix=corr_matrix,
            dates=eval_date_strs,
            portfolio_drawdown=_round_series(port_dd, 3, scale=100.0),
            spy_drawdown=_round_series(spy_dd, 3, scale=100.0),
            portfolio_rolling_vol=_round_nullable_series(port_rvol, 3, scale=100.0),
            spy_rolling_vol=_round_nullable_series(spy_rvol, 3, scale=100.0),
            rolling_beta_dates=[eval_date_strs[i] for i in range(len(eval_date_strs)) if valid_rb_mask[i]],
            rolling_beta=[round(float(rolling_beta[i]), 3) for i in range(len(eval_date_strs)) if valid_rb_mask[i]],
            momentum_corr_dates=[eval_date_strs[i] for i in range(len(eval_date_strs)) if valid_mom_mask[i]],
            momentum_corr=[round(float(mom_corr[i]), 3) for i in range(len(eval_date_strs)) if valid_mom_mask[i]],
            daily_returns=_round_series(port_ret_net, 4, scale=100.0),
        )
        return section, var_95, cvar_95, latest_beta, latest_mom_exp

    @staticmethod
    def _build_backtest_section(
        eval_date_strs: list[str],
        wf_bt: BacktestResult,
        static_bt: BacktestResult,
        spy_cum: np.ndarray,
        wf_gross_perf: dict,
        wf_net_perf: dict,
        port_perf: dict,
        eval_spy_prices: np.ndarray,
        eval_regime_scores: np.ndarray,
        eval_regime_states: np.ndarray,
    ) -> BacktestSection:
        recent_n = min(20, len(eval_date_strs))
        recent_rows = [
            RecentRegimeRow(
                date=eval_date_strs[i],
                spy_price=round(float(eval_spy_prices[i]), 2),
                score=round(float(eval_regime_scores[i]), 3) if np.isfinite(eval_regime_scores[i]) else 0.5,
                regime=cast(RegimeState, str(eval_regime_states[i])),
                turnover_pct=round(float(wf_bt.daily_turnover[i] * 100.0), 2),
            )
            for i in range(len(eval_date_strs) - recent_n, len(eval_date_strs))
        ]

        return BacktestSection(
            dates=eval_date_strs,
            wf_regime_gross=_round_series(wf_bt.gross_equity, 4),
            wf_regime_net=_round_series(wf_bt.net_equity, 4),
            static_net=_round_series(static_bt.net_equity, 4),
            spy=_round_series(spy_cum, 4),
            summary=BacktestSummary(
                wf_regime_gross_return=wf_gross_perf["total_return_pct"],
                wf_regime_net_return=wf_net_perf["total_return_pct"],
                wf_regime_net_sharpe=wf_net_perf["sharpe_ratio"],
                wf_regime_max_dd=wf_net_perf["max_drawdown_pct"],
                static_net_return=port_perf["total_return_pct"],
                static_net_sharpe=port_perf["sharpe_ratio"],
                annualized_turnover=wf_bt.annualized_turnover_pct,
                total_cost_drag=wf_bt.total_cost_drag_pct,
            ),
            regime_series=RegimeSeries(
                dates=eval_date_strs,
                spy_price=_round_series(eval_spy_prices, 2),
                regime_score=[
                    round(float(x), 3) if np.isfinite(x) else 0.5 for x in eval_regime_scores
                ],
                regime_state=[cast(RegimeState, str(x)) for x in eval_regime_states],
            ),
            recent_regime_rows=recent_rows,
        )
