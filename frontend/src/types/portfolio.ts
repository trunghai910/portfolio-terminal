export type OptimizationMethod = "max_sharpe_lw" | "hrp";
export type RebalanceFrequency = "M" | "Q" | "Y" | "NONE";
export type RegimeState = "BULL" | "NEUTRAL" | "BEAR";
export type SignalAction = "BUY" | "SELL" | "HOLD";
export type RiskFreeSource = "^IRX" | "user_override" | "default";

export interface AnalyzeRequest {
  tickers: string[];
  weights: Record<string, number>;
  start_date: string;
  end_date?: string | null;
  risk_free_rate?: number | null;
  optimization_method: OptimizationMethod;
  max_weight: number;
  rebalance_frequency: RebalanceFrequency;
  tx_cost_bps: number;
  slippage_bps: number;
  lookback_days: number;
}

export interface MetaInfo {
  valid_tickers: string[];
  invalid_tickers: string[];
  warnings: string[];
  requested_start_date: string;
  effective_start_date: string;
  end_date: string;
  risk_free_rate: number;
  risk_free_latest: number;
  risk_free_source: RiskFreeSource;
  trading_days: number;
  optimization_method: OptimizationMethod;
}

export interface PortfolioKPIs {
  total_return: number;
  cagr: number;
  spy_total_return: number;
  active_return: number;
  annual_volatility: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  max_drawdown: number;
  var_95: number;
  cvar_95: number;
  rolling_beta_latest: number;
  momentum_12_1_exposure: number;
  capm_alpha: number;
  treynor_ratio: number;
  current_regime: RegimeState;
  current_regime_score: number;
  optimized_return: number;
  optimized_volatility: number;
  optimized_sharpe: number;
}

export interface AllocationItem {
  ticker: string;
  weight: number;
}

export interface AssetPoint {
  ticker: string;
  return_pct: number;
  volatility_pct: number;
}

export interface PortfolioPoint {
  return_pct: number;
  volatility_pct: number;
  sharpe: number;
}

export interface FactorLoading {
  factor: string;
  label: string;
  beta: number;
  t_stat: number;
  univariate_beta: number;
}

export interface AnalyzeResponse {
  meta: MetaInfo;
  portfolio: {
    kpis: PortfolioKPIs;
    current_allocation: AllocationItem[];
    optimized_allocation: AllocationItem[];
    equity_curves: {
      dates: string[];
      current_portfolio: number[];
      optimized_in_sample: number[];
      walk_forward_net: number[];
      spy: number[];
    };
    efficient_frontier: {
      mc_volatility: number[];
      mc_return: number[];
      mc_sharpe: number[];
      assets: AssetPoint[];
      current_point: PortfolioPoint;
      optimal_point: PortfolioPoint;
    };
  };
  risk: {
    correlation_matrix: { tickers: string[]; values: number[][] };
    dates: string[];
    portfolio_drawdown: number[];
    spy_drawdown: number[];
    portfolio_rolling_vol: (number | null)[];
    spy_rolling_vol: (number | null)[];
    rolling_beta_dates: string[];
    rolling_beta: number[];
    momentum_corr_dates: string[];
    momentum_corr: number[];
    daily_returns: number[];
  };
  signals: {
    current_signal: SignalAction;
    latest_score: number;
    dates: string[];
    portfolio_signal_series: number[];
    recent_rows: Record<string, string | number>[];
  };
  backtest: {
    dates: string[];
    wf_regime_gross: number[];
    wf_regime_net: number[];
    static_net: number[];
    spy: number[];
    summary: {
      wf_regime_gross_return: number;
      wf_regime_net_return: number;
      wf_regime_net_sharpe: number;
      wf_regime_max_dd: number;
      static_net_return: number;
      static_net_sharpe: number;
      annualized_turnover: number;
      total_cost_drag: number;
    };
    regime_series: {
      dates: string[];
      spy_price: number[];
      regime_score: number[];
      regime_state: RegimeState[];
    };
    recent_regime_rows: {
      date: string;
      spy_price: number;
      score: number;
      regime: RegimeState;
      turnover_pct: number;
    }[];
  };
  factors: {
    r_squared: number;
    multivariate_alpha_annual_pct: number;
    capm_alpha_annual_pct: number;
    treynor_ratio: number;
    factor_loadings: FactorLoading[];
    rolling_beta_heatmap: {
      dates: string[];
      tickers: string[];
      z: (number | null)[][];
    };
    active_attribution: {
      dates: string[];
      cumulative_active: number[];
    };
    ranked_betas: { ticker: string; beta: number }[];
  };
}

export interface CacheStatus {
  db_path: string;
  size_kb: number;
  total_tickers: number;
  tickers: { ticker: string; rows: number; min_date: string | null; max_date: string | null }[];
}
