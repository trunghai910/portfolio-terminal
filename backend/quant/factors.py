from __future__ import annotations

import numpy as np

from config.settings import ROLLING_ASSET_BETA_WINDOW, TRADING_DAYS_PER_YEAR
from quant.risk import compute_rolling_beta


def compute_multivariate_factor_analysis(
    port_returns: np.ndarray,
    spy_returns: np.ndarray,
    qqq_returns: np.ndarray | None,
    iwm_returns: np.ndarray | None,
    vix_returns: np.ndarray | None,
    asset_returns_matrix: np.ndarray,
    tickers: list[str],
    eval_dates: list[str],
    risk_free_rate: float | np.ndarray = 0.04,
) -> dict:
    """
    Econometrically sound Multivariate Factor Model (OLS) + CAPM Jensen's Alpha.

    Fixes two critical errors in the original article:
      1. Multicollinearity: Instead of regressing separately on highly correlated raw ETFs
         (SPY, QQQ, IWM), we construct orthogonalized spread factors:
           - MKT:         SPY excess return (SPY - Rf_t)
           - TECH_SPREAD: QQQ - SPY (Growth/Tech tilt relative to broad market)
           - SIZE_SPREAD: IWM - SPY (Small-cap vs Large-cap spread, proxy for Fama-French SMB)
           - VOL_SHOCK:   ^VIX daily % change
      2. Time-Varying Risk-Free Rate (Rf_t): Supports daily floating T-Bill yields (^IRX)
         so Jensen's Alpha and Treynor Ratio are unbiased across multi-year rate cycles.
    """
    if isinstance(risk_free_rate, np.ndarray):
        rf_daily = np.asarray(risk_free_rate, dtype=float)
        if len(rf_daily) != len(port_returns):
            raise ValueError(
                f"risk_free_rate array length ({len(rf_daily)}) must match port_returns ({len(port_returns)})."
            )
    else:
        rf_daily = float(risk_free_rate) / TRADING_DAYS_PER_YEAR

    y_excess = port_returns - rf_daily
    mkt_excess = spy_returns - rf_daily

    # Standard CAPM (univariate excess return regression)
    var_mkt = float(np.var(mkt_excess, ddof=1))
    cov_pm = float(np.cov(y_excess, mkt_excess, ddof=1)[0, 1]) if var_mkt > 1e-12 else 0.0
    capm_beta = cov_pm / var_mkt if var_mkt > 1e-12 else 0.0
    capm_alpha_ann = (
        float(np.mean(y_excess)) - capm_beta * float(np.mean(mkt_excess))
    ) * TRADING_DAYS_PER_YEAR
    treynor = (
        (float(np.mean(y_excess)) * TRADING_DAYS_PER_YEAR) / capm_beta
        if abs(capm_beta) > 1e-6
        else 0.0
    )

    # Assemble multivariate factor matrix
    factor_specs: list[tuple[str, str, np.ndarray]] = [
        ("MKT", "Market Excess (SPY - Rf)", mkt_excess),
    ]
    if qqq_returns is not None and len(qqq_returns) == len(port_returns):
        factor_specs.append(("TECH_SPREAD", "Tech / Growth Spread (QQQ - SPY)", qqq_returns - spy_returns))
    if iwm_returns is not None and len(iwm_returns) == len(port_returns):
        factor_specs.append(("SIZE_SPREAD", "Size Spread (IWM - SPY)", iwm_returns - spy_returns))
    if vix_returns is not None and len(vix_returns) == len(port_returns):
        factor_specs.append(("VOL_SHOCK", "Volatility Shock (^VIX %Δ)", vix_returns))

    # Filter rows where all factor columns are finite
    X_raw = np.column_stack([spec[2] for spec in factor_specs])
    valid_mask = np.isfinite(y_excess) & np.all(np.isfinite(X_raw), axis=1)
    y_clean = y_excess[valid_mask]
    X_clean = X_raw[valid_mask]

    n_obs, k_factors = X_clean.shape
    X_design = np.column_stack([np.ones(n_obs), X_clean])  # intercept + factors

    if n_obs > k_factors + 2:
        coeffs, _, _, _ = np.linalg.lstsq(X_design, y_clean, rcond=None)
        y_hat = X_design @ coeffs
        residuals = y_clean - y_hat
        ss_res = float(np.sum(residuals ** 2))
        ss_tot = float(np.sum((y_clean - np.mean(y_clean)) ** 2))
        r_squared = 1.0 - (ss_res / ss_tot) if ss_tot > 1e-12 else 0.0

        # Standard errors & t-statistics
        dof = max(1, n_obs - k_factors - 1)
        sigma2 = ss_res / dof
        xtx_inv = np.linalg.pinv(X_design.T @ X_design)
        se = np.sqrt(np.maximum(np.diag(xtx_inv) * sigma2, 1e-18))
        t_stats = coeffs / se
        multi_alpha_ann = float(coeffs[0]) * TRADING_DAYS_PER_YEAR
    else:
        coeffs = np.zeros(k_factors + 1)
        t_stats = np.zeros(k_factors + 1)
        r_squared = 0.0
        multi_alpha_ann = 0.0

    factor_loadings = []
    for idx, (code, label, series) in enumerate(factor_specs):
        # Also provide univariate beta for direct comparison
        f_col = X_clean[:, idx]
        v_f = float(np.var(f_col, ddof=1)) if len(f_col) > 1 else 0.0
        uni_beta = float(np.cov(y_clean, f_col, ddof=1)[0, 1] / v_f) if v_f > 1e-12 else 0.0
        factor_loadings.append(
            {
                "factor": code,
                "label": label,
                "beta": round(float(coeffs[idx + 1]), 4),
                "t_stat": round(float(t_stats[idx + 1]), 2),
                "univariate_beta": round(uni_beta, 4),
            }
        )

    # 60-day rolling beta per asset vs SPY (for Heatmap & Highest/Lowest Beta table)
    z_matrix: list[list[float | None]] = []
    ranked_betas: list[dict] = []
    window = min(ROLLING_ASSET_BETA_WINDOW, max(15, len(eval_dates) // 2))
    for j, ticker in enumerate(tickers):
        rb = compute_rolling_beta(asset_returns_matrix[:, j], spy_returns, window=window)
        z_matrix.append([None if not np.isfinite(v) else round(float(v), 3) for v in rb])
        finite_vals = rb[np.isfinite(rb)]
        latest_b = float(finite_vals[-1]) if len(finite_vals) > 0 else 0.0
        ranked_betas.append({"ticker": ticker, "beta": round(latest_b, 4)})

    ranked_betas.sort(key=lambda x: x["beta"], reverse=True)

    # Active Return Attribution vs SPY
    active_ret = port_returns - spy_returns
    cum_active = np.cumprod(1.0 + active_ret) - 1.0

    return {
        "r_squared": round(float(max(0.0, min(1.0, r_squared))), 4),
        "multivariate_alpha_annual_pct": round(multi_alpha_ann * 100.0, 2),
        "capm_alpha_annual_pct": round(capm_alpha_ann * 100.0, 2),
        "treynor_ratio": round(float(treynor), 3),
        "factor_loadings": factor_loadings,
        "rolling_beta_heatmap": {
            "dates": eval_dates,
            "tickers": tickers,
            "z": z_matrix,
        },
        "active_attribution": {
            "dates": eval_dates,
            "cumulative_active": [round(float(x * 100.0), 3) for x in cum_active],
        },
        "ranked_betas": ranked_betas,
    }