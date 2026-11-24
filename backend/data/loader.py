from __future__ import annotations

import datetime as dt
import logging
import threading
from pathlib import Path
from typing import Iterable

import duckdb
import pandas as pd
import polars as pl
import yfinance as yf

from config.settings import DB_PATH, WARMUP_CALENDAR_DAYS

logger = logging.getLogger(__name__)

_LONG_PRICE_SCHEMA = {"ticker": pl.Utf8, "date": pl.Date, "close": pl.Float64}


def _empty_long_prices() -> pl.DataFrame:
    return pl.DataFrame(schema=_LONG_PRICE_SCHEMA)


class MarketDataStore:
    """
    Thread-safe DuckDB-backed Cache-Aside market data store returning Polars DataFrames.
    Solves repeated uncached yf.download() calls, prevents caching empty/failed API responses,
    and guards DuckDB mutations with a re-entrant lock for concurrent FastAPI requests.
    """

    def __init__(self, db_path: Path | str = DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init_schema()

    def _connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(str(self.db_path))

    def _init_schema(self) -> None:
        with self._lock, self._connect() as con:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS daily_prices (
                    ticker VARCHAR NOT NULL,
                    date DATE NOT NULL,
                    close DOUBLE NOT NULL,
                    PRIMARY KEY (ticker, date)
                )
                """
            )

    def _get_cached_ranges(self, tickers: list[str]) -> dict[str, tuple[dt.date, dt.date]]:
        if not tickers:
            return {}
        with self._lock, self._connect() as con:
            rows = con.execute(
                """
                SELECT ticker, MIN(date) AS min_d, MAX(date) AS max_d
                FROM daily_prices
                WHERE ticker IN (SELECT UNNEST(?))
                GROUP BY ticker
                """,
                [tickers],
            ).fetchall()
        return {r[0]: (r[1], r[2]) for r in rows}

    def _download_batch(
        self,
        tickers: list[str],
        start: dt.date,
        end: dt.date,
    ) -> pl.DataFrame:
        """Batch-fetch adjusted Close prices from Yahoo Finance into long-format Polars DF."""
        if not tickers or start >= end:
            return _empty_long_prices()

        try:
            raw = yf.download(
                tickers=tickers,
                start=start.isoformat(),
                end=(end + dt.timedelta(days=1)).isoformat(),
                auto_adjust=True,
                progress=False,
                threads=True,
            )
        except Exception as exc:
            logger.warning("yfinance batch download failed for %s: %s", tickers, exc)
            return _empty_long_prices()

        if raw is None or raw.empty:
            return _empty_long_prices()

        # Normalize both single-ticker and multi-ticker MultiIndex layouts safely
        if isinstance(raw.columns, pd.MultiIndex):
            if "Close" in raw.columns.get_level_values(0):
                close_df = raw["Close"]
            elif "Close" in raw.columns.get_level_values(-1):
                close_df = raw.xs("Close", axis=1, level=-1)
            else:
                return _empty_long_prices()
        else:
            if "Close" not in raw.columns:
                return _empty_long_prices()
            close_df = raw[["Close"]].rename(columns={"Close": tickers[0]})

        if isinstance(close_df, pd.Series):
            close_df = close_df.to_frame(name=tickers[0])

        close_df = close_df.copy()
        close_df.index = pd.to_datetime(close_df.index).tz_localize(None)

        records: list[pl.DataFrame] = []
        for col in close_df.columns:
            series = pd.to_numeric(close_df[col], errors="coerce").dropna()
            if series.empty:
                continue
            ticker_name = str(col).strip().upper()
            records.append(
                pl.DataFrame(
                    {
                        "ticker": [ticker_name] * len(series),
                        "date": [d.date() for d in series.index],
                        "close": series.to_numpy(dtype=float),
                    }
                )
            )

        if not records:
            return _empty_long_prices()
        return pl.concat(records, how="vertical")

    def _upsert_prices(self, df_long: pl.DataFrame) -> None:
        """Insert only non-empty valid rows into DuckDB, updating existing rows on conflict."""
        if df_long.is_empty():
            return
        arrow_tbl = df_long.to_arrow()
        with self._lock, self._connect() as con:
            con.register("incoming_prices", arrow_tbl)
            con.execute(
                """
                INSERT INTO daily_prices (ticker, date, close)
                SELECT ticker, date, close
                FROM incoming_prices
                WHERE close IS NOT NULL AND NOT isnan(close)
                ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close
                """
            )

    def fetch_prices_wide(
        self,
        tickers: Iterable[str],
        start_date: dt.date,
        end_date: dt.date | None = None,
        warmup_days: int = WARMUP_CALENDAR_DAYS,
    ) -> pl.DataFrame:
        """
        Cache-aside incremental loader:
          1. Computes warm-up fetch_start = start_date - warmup_days (ensures >=252 trading days).
          2. Detects missing tickers, missing head ranges, and missing tail ranges in DuckDB.
          3. Downloads only missing slices from Yahoo Finance and upserts them.
          4. Reads unified dataset from DuckDB straight into Polars wide format (date x tickers).
        """
        clean_tickers = sorted({t.strip().upper() for t in tickers if t and t.strip()})
        if not clean_tickers:
            return pl.DataFrame(schema={"date": pl.Date})

        effective_end = end_date or dt.date.today()
        fetch_start = start_date - dt.timedelta(days=warmup_days)

        cached = self._get_cached_ranges(clean_tickers)

        # Group missing requests by (start, end) range to minimize API round-trips
        range_groups: dict[tuple[dt.date, dt.date], list[str]] = {}
        for t in clean_tickers:
            if t not in cached:
                range_groups.setdefault((fetch_start, effective_end), []).append(t)
            else:
                min_d, max_d = cached[t]
                # Allow calendar tolerance on head/tail for weekends/holidays
                if fetch_start < min_d - dt.timedelta(days=5):
                    range_groups.setdefault((fetch_start, min_d), []).append(t)
                if effective_end > max_d + dt.timedelta(days=3):
                    tail_start = max_d - dt.timedelta(days=2)
                    range_groups.setdefault((tail_start, effective_end), []).append(t)

        for (req_start, req_end), group_tickers in range_groups.items():
            downloaded = self._download_batch(group_tickers, req_start, req_end)
            self._upsert_prices(downloaded)

        with self._lock, self._connect() as con:
            query = """
                SELECT date, ticker, close
                FROM daily_prices
                WHERE ticker IN (SELECT UNNEST(?))
                  AND date >= ?
                  AND date <= ?
                ORDER BY date ASC
            """
            params = [clean_tickers, fetch_start, effective_end]
            relation = con.sql(query, params=params)
            if hasattr(relation, "pl"):
                long_df = relation.pl()
            else:
                long_df = pl.from_arrow(relation.to_arrow_table())

        if long_df.is_empty():
            return pl.DataFrame(schema={"date": pl.Date})

        return (
            long_df.pivot(on="ticker", index="date", values="close", aggregate_function="first")
            .sort("date")
        )

    def get_cache_status(self) -> dict:
        with self._lock, self._connect() as con:
            rows = con.execute(
                """
                SELECT ticker, COUNT(*) AS n_rows, MIN(date) AS min_date, MAX(date) AS max_date
                FROM daily_prices
                GROUP BY ticker
                ORDER BY ticker ASC
                """
            ).fetchall()
            size_kb = round(self.db_path.stat().st_size / 1024, 2) if self.db_path.exists() else 0.0
        return {
            "db_path": str(self.db_path),
            "size_kb": size_kb,
            "total_tickers": len(rows),
            "tickers": [
                {
                    "ticker": r[0],
                    "rows": int(r[1]),
                    "min_date": r[2].isoformat() if r[2] else None,
                    "max_date": r[3].isoformat() if r[3] else None,
                }
                for r in rows
            ],
        }

    def clear_cache(self) -> None:
        with self._lock, self._connect() as con:
            con.execute("DELETE FROM daily_prices")
