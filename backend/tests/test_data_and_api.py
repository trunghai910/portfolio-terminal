from __future__ import annotations

import datetime as dt
from pathlib import Path

import numpy as np
import polars as pl
from fastapi.testclient import TestClient

from app.dependencies import get_market_store
from app.main import app
from data.loader import MarketDataStore
from data.processor import prepare_market_data
from quant.indicators import compute_ma_crossover_signals, compute_true_12_1_momentum_series


def _business_dates(n: int, start: dt.date = dt.date(2021, 1, 4)) -> list[dt.date]:
    dates: list[dt.date] = []
    curr = start
    while len(dates) < n:
        if curr.weekday() < 5:
            dates.append(curr)
        curr += dt.timedelta(days=1)
    return dates


def _build_synthetic_wide_prices(n: int = 560) -> tuple[list[dt.date], pl.DataFrame]:
    rng = np.random.default_rng(31415)
    dates = _business_dates(n)
    spy_ret = rng.normal(0.0004, 0.01, size=n)
    spy = 400.0 * np.cumprod(1.0 + spy_ret)
    aapl = 150.0 * np.cumprod(1.0 + 1.1 * spy_ret + rng.normal(0.0002, 0.008, size=n))
    msft = 280.0 * np.cumprod(1.0 + 1.0 * spy_ret + rng.normal(0.0001, 0.007, size=n))
    qqq = 350.0 * np.cumprod(1.0 + 1.15 * spy_ret + rng.normal(0.0001, 0.005, size=n))
    iwm = 190.0 * np.cumprod(1.0 + 1.05 * spy_ret + rng.normal(0.0, 0.006, size=n))
    vix = np.clip(18.0 - 120.0 * spy_ret + rng.normal(0.0, 1.0, size=n), 10.0, 60.0)
    irx = np.linspace(3.5, 4.8, n)

    wide = pl.DataFrame(
        {
            "date": dates,
            "SPY": spy,
            "AAPL": aapl,
            "MSFT": msft,
            "QQQ": qqq,
            "IWM": iwm,
            "^VIX": vix,
            "^IRX": irx,
        }
    )
    return dates, wide


def _seed_store(db_path: Path, wide: pl.DataFrame) -> MarketDataStore:
    store = MarketDataStore(db_path=db_path)
    frames = []
    for col in wide.columns:
        if col == "date":
            continue
        frames.append(
            pl.DataFrame(
                {
                    "ticker": [col] * wide.height,
                    "date": wide["date"].to_list(),
                    "close": wide[col].to_list(),
                }
            )
        )
    store._upsert_prices(pl.concat(frames, how="vertical"))
    return store


def test_prepare_market_data_handles_invalid_ticker_and_late_ipo():
    dates, wide = _build_synthetic_wide_prices(400)
    # Simulate a recent IPO that starts 100 sessions after requested start_date
    late_col = [None] * 280 + [50.0 + i * 0.2 for i in range(120)]
    wide_ipo = wide.with_columns(pl.Series("NEWIPO", late_col, dtype=pl.Float64))

    req_start = dates[200]
    prepared = prepare_market_data(
        wide_prices=wide_ipo,
        requested_tickers=["AAPL", "NEWIPO", "FAKE_TICKER"],
        raw_weights={"AAPL": 0.5, "NEWIPO": 0.3, "FAKE_TICKER": 0.2},
        start_date=req_start,
    )

    assert prepared.valid_tickers == ["AAPL", "NEWIPO"]
    assert prepared.invalid_tickers == ["FAKE_TICKER"]
    assert abs(float(np.sum(prepared.normalized_weights)) - 1.0) < 1e-9
    assert prepared.effective_start_date > req_start
    assert len(prepared.warnings) == 2


def test_indicators_ma_crossover_and_12_1_momentum():
    dates, wide = _build_synthetic_wide_prices(350)
    signals = compute_ma_crossover_signals(
        prices_full=wide.select(["date", "AAPL", "MSFT"]),
        tickers=["AAPL", "MSFT"],
        weights=np.array([0.6, 0.4]),
        start_date=dates[100],
    )
    assert signals["current_signal"] in {"BUY", "SELL", "HOLD"}
    assert 0.0 <= signals["latest_score"] <= 1.0
    assert len(signals["dates"]) == len(signals["portfolio_signal_series"])
    assert len(signals["recent_rows"]) <= 20

    mom = compute_true_12_1_momentum_series(wide["SPY"].to_numpy())
    assert np.all(np.isnan(mom[:252]))
    assert np.all(np.isfinite(mom[252:]))


def test_duckdb_store_cache_lifecycle(tmp_path: Path):
    dates, wide = _build_synthetic_wide_prices(60)
    store = _seed_store(tmp_path / "test_market.duckdb", wide)

    status = store.get_cache_status()
    assert status["total_tickers"] == 7
    assert any(item["ticker"] == "AAPL" and item["rows"] == 60 for item in status["tickers"])

    # Fetch within cached range should not trigger external download
    store._download_batch = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("Unexpected download"))
    fetched = store.fetch_prices_wide(
        ["AAPL", "SPY"],
        start_date=dates[10],
        end_date=dates[-1],
        warmup_days=5,
    )
    assert fetched.height > 0
    assert "AAPL" in fetched.columns and "SPY" in fetched.columns

    store.clear_cache()
    assert store.get_cache_status()["total_tickers"] == 0


def test_api_analyze_and_cache_endpoints(tmp_path: Path):
    dates, wide = _build_synthetic_wide_prices(560)
    store = _seed_store(tmp_path / "api_market.duckdb", wide)
    store._download_batch = lambda *args, **kwargs: pl.DataFrame(
        schema={"ticker": pl.Utf8, "date": pl.Date, "close": pl.Float64}
    )

    app.dependency_overrides[get_market_store] = lambda: store
    try:
        client = TestClient(app)

        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        res = client.post(
            "/api/analyze",
            json={
                "tickers": ["AAPL", "MSFT"],
                "weights": {"AAPL": 0.6, "MSFT": 0.4},
                "start_date": dates[300].isoformat(),
                "end_date": dates[-1].isoformat(),
                "optimization_method": "max_sharpe_lw",
                "rebalance_frequency": "M",
            },
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["meta"]["risk_free_source"] == "^IRX"
        assert body["meta"]["risk_free_latest"] > 0
        assert body["meta"]["valid_tickers"] == ["AAPL", "MSFT"]
        assert len(body["portfolio"]["equity_curves"]["dates"]) == body["meta"]["trading_days"]
        assert body["signals"]["current_signal"] in {"BUY", "SELL", "HOLD"}
        assert len(body["factors"]["factor_loadings"]) == 4

        bad_date = client.post(
            "/api/analyze",
            json={"tickers": ["AAPL"], "start_date": "not-a-date"},
        )
        assert bad_date.status_code == 400

        cache_status = client.get("/api/cache/status")
        assert cache_status.status_code == 200
        assert cache_status.json()["total_tickers"] == 7

        cleared = client.delete("/api/cache/clear")
        assert cleared.status_code == 200
        assert cleared.json() == {"status": "cleared"}
    finally:
        app.dependency_overrides.clear()
