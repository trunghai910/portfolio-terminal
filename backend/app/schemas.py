from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field, field_validator

OptimizationMethod = Literal["max_sharpe_lw", "hrp"]
RebalanceFrequency = Literal["M", "Q", "Y", "NONE"]
RegimeState = Literal["BULL", "NEUTRAL", "BEAR"]
SignalAction = Literal["BUY", "SELL", "HOLD"]
RiskFreeSource = Literal["^IRX", "user_override", "default"]


class AnalyzeRequest(BaseModel):
    tickers: list[str] = Field(default=["AAPL", "MSFT", "NVDA"], min_length=1, max_length=50)
    weights: dict[str, float] = Field(default_factory=dict)
    start_date: str = Field(default="2023-01-01", description="ISO YYYY-MM-DD")
    end_date: str | None = Field(default=None, description="Optional ISO YYYY-MM-DD")
    risk_free_rate: float | None = Field(
        default=None,
        ge=0.0,
        le=0.25,
        description="Annualized risk-free rate (e.g., 0.04). If None, auto-fetches ^IRX.",
    )
    optimization_method: OptimizationMethod = "max_sharpe_lw"
    max_weight: float = Field(default=0.50, ge=0.05, le=1.0)
    rebalance_frequency: RebalanceFrequency = "M"
    tx_cost_bps: float = Field(default=5.0, ge=0.0, le=200.0)
    slippage_bps: float = Field(default=5.0, ge=0.0, le=200.0)
    lookback_days: int = Field(default=252, ge=60, le=756)

    @field_validator("tickers")
    @classmethod
    def clean_tickers(cls, v: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(t.strip().upper() for t in v if t and t.strip()))
        if not cleaned:
            raise ValueError("At least one valid ticker symbol is required.")
        return cleaned


class AllocationItem(BaseModel):
    ticker: str
    weight: float


class AssetPoint(BaseModel):
    ticker: str
    return_pct: float
    volatility_pct: float


class PortfolioPoint(BaseModel):
    return_pct: float
    volatility_pct: float
    sharpe: float


class PortfolioKPIs(BaseModel):
    total_return: float
    cagr: float
    spy_total_return: float
    active_return: float
    annual_volatility: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    max_drawdown: float
    var_95: float
    cvar_95: float
    rolling_beta_latest: float
    momentum_12_1_exposure: float
    capm_alpha: float
    treynor_ratio: float
    current_regime: RegimeState
    current_regime_score: float
    optimized_return: float
    optimized_volatility: float
    optimized_sharpe: float


class EquityCurves(BaseModel):
    dates: list[str]
    current_portfolio: list[float]
    optimized_in_sample: list[float]
    walk_forward_net: list[float]
    spy: list[float]


class EfficientFrontier(BaseModel):
    mc_volatility: list[float]
    mc_return: list[float]
    mc_sharpe: list[float]
    assets: list[AssetPoint]
    current_point: PortfolioPoint
    optimal_point: PortfolioPoint


class PortfolioSection(BaseModel):
    kpis: PortfolioKPIs
    current_allocation: list[AllocationItem]
    optimized_allocation: list[AllocationItem]
    equity_curves: EquityCurves
    efficient_frontier: EfficientFrontier


class CorrelationMatrix(BaseModel):
    tickers: list[str]
    values: list[list[float]]


class RiskSection(BaseModel):
    correlation_matrix: CorrelationMatrix
    dates: list[str]
    portfolio_drawdown: list[float]
    spy_drawdown: list[float]
    portfolio_rolling_vol: list[float | None]
    spy_rolling_vol: list[float | None]
    rolling_beta_dates: list[str]
    rolling_beta: list[float]
    momentum_corr_dates: list[str]
    momentum_corr: list[float]
    daily_returns: list[float]


class SignalsSection(BaseModel):
    current_signal: SignalAction
    latest_score: float
    dates: list[str]
    portfolio_signal_series: list[float]
    recent_rows: list[dict[str, str | int | float]]


class BacktestSummary(BaseModel):
    wf_regime_gross_return: float
    wf_regime_net_return: float
    wf_regime_net_sharpe: float
    wf_regime_max_dd: float
    static_net_return: float
    static_net_sharpe: float
    annualized_turnover: float
    total_cost_drag: float


class RegimeSeries(BaseModel):
    dates: list[str]
    spy_price: list[float]
    regime_score: list[float]
    regime_state: list[RegimeState]


class RecentRegimeRow(BaseModel):
    date: str
    spy_price: float
    score: float
    regime: RegimeState
    turnover_pct: float


class BacktestSection(BaseModel):
    dates: list[str]
    wf_regime_gross: list[float]
    wf_regime_net: list[float]
    static_net: list[float]
    spy: list[float]
    summary: BacktestSummary
    regime_series: RegimeSeries
    recent_regime_rows: list[RecentRegimeRow]


class FactorLoading(BaseModel):
    factor: str
    label: str
    beta: float
    t_stat: float
    univariate_beta: float


class RollingBetaHeatmap(BaseModel):
    dates: list[str]
    tickers: list[str]
    z: list[list[float | None]]


class ActiveAttribution(BaseModel):
    dates: list[str]
    cumulative_active: list[float]


class RankedBetaItem(BaseModel):
    ticker: str
    beta: float


class FactorsSection(BaseModel):
    r_squared: float
    multivariate_alpha_annual_pct: float
    capm_alpha_annual_pct: float
    treynor_ratio: float
    factor_loadings: list[FactorLoading]
    rolling_beta_heatmap: RollingBetaHeatmap
    active_attribution: ActiveAttribution
    ranked_betas: list[RankedBetaItem]


class MetaInfo(BaseModel):
    valid_tickers: list[str]
    invalid_tickers: list[str]
    warnings: list[str]
    requested_start_date: str
    effective_start_date: str
    end_date: str
    risk_free_rate: float
    risk_free_latest: float
    risk_free_source: RiskFreeSource
    trading_days: int
    optimization_method: OptimizationMethod


class AnalyzeResponse(BaseModel):
    meta: MetaInfo
    portfolio: PortfolioSection
    risk: RiskSection
    signals: SignalsSection
    backtest: BacktestSection
    factors: FactorsSection


class CacheTickerStatus(BaseModel):
    ticker: str
    rows: int
    min_date: str | None
    max_date: str | None


class CacheStatusResponse(BaseModel):
    db_path: str
    size_kb: float
    total_tickers: int
    tickers: list[CacheTickerStatus]


class CacheClearResponse(BaseModel):
    status: Literal["cleared"]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    engine: str
