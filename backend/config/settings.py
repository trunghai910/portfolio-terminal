from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv("PORTFOLIO_DB_PATH", str(BASE_DIR / "data" / "market_data.duckdb")))

# API & CORS configuration
_raw_cors = os.getenv(
    "API_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
API_CORS_ORIGINS: list[str] = [origin.strip() for origin in _raw_cors.split(",") if origin.strip()]
API_CORS_ALLOW_CREDENTIALS: bool = (
    os.getenv("API_CORS_ALLOW_CREDENTIALS", "true").lower() == "true"
    and "*" not in API_CORS_ORIGINS
)

# Market constants
TRADING_DAYS_PER_YEAR = 252
WARMUP_CALENDAR_DAYS = 390  # Guarantees >= 260 trading days for MA200, 12-1 Momentum & WF window
FFILL_LIMIT_DAYS = 5        # Fill isolated 1-5 day trading halts/holidays without masking delistings

# Default quantitative parameters
DEFAULT_RISK_FREE_RATE = 0.04   # Fallback 4.0% annualized if ^IRX unavailable
DEFAULT_TX_COST_BPS = 5.0       # 5 bps brokerage / exchange fee
DEFAULT_SLIPPAGE_BPS = 5.0      # 5 bps market impact / bid-ask slippage
DEFAULT_MAX_WEIGHT = 0.50       # Single-asset weight cap
DEFAULT_LOOKBACK_DAYS = 252     # 1-year Walk-Forward estimation window
MIN_OBS_FOR_OPTIMIZATION = 60   # Minimum trading days required before running SLSQP/HRP
MONTE_CARLO_SAMPLES = 4000

# Benchmark & Factor ETFs
BENCHMARK_TICKER = "SPY"
RISK_FREE_TICKER = "^IRX"       # 13-Week US Treasury Bill Yield (quoted in %)
FACTOR_TICKERS = ["SPY", "QQQ", "IWM", "^VIX"]

# Rolling windows
ROLLING_VOL_WINDOW = 20
ROLLING_BETA_WINDOW = 20
ROLLING_ASSET_BETA_WINDOW = 60
REGIME_VOL_QUANTILE_WINDOW = 252
REGIME_VOL_QUANTILE_LEVEL = 0.70
