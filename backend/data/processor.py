from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import numpy as np
import polars as pl

from config.settings import FFILL_LIMIT_DAYS


@dataclass
class PreparedMarketData:
    """Validated, date-aligned market data separated into warm-up and evaluation slices."""
    valid_tickers: list[str]
    invalid_tickers: list[str]
    normalized_weights: np.ndarray
    warnings: list[str]
    effective_start_date: dt.date
    end_date: dt.date
    # Full warm-up wide DataFrames (used to compute MA200, 12-1 Momentum, WF lookback)
    portfolio_prices_full: pl.DataFrame
    portfolio_returns_full: pl.DataFrame
    benchmark_prices_full: pl.DataFrame
    # Evaluation window (strictly >= effective_start_date, inner-joined across valid tickers & SPY)
    eval_dates: list[dt.date]
    eval_returns_matrix: np.ndarray      # shape (T, N) aligned to valid_tickers
    eval_spy_returns: np.ndarray         # shape (T,)
    # Full warm-up aligned arrays for Walk-Forward engine
    full_dates: list[dt.date]
    full_returns_matrix: np.ndarray      # shape (T_full, N)
    eval_start_idx: int                  # index in full_dates corresponding to eval_dates[0]


def prepare_market_data(
    wide_prices: pl.DataFrame,
    requested_tickers: list[str],
    raw_weights: dict[str, float],
    start_date: dt.date,
    benchmark_ticker: str = "SPY",
    ffill_limit: int = FFILL_LIMIT_DAYS,
) -> PreparedMarketData:
    """
    Cleans wide Polars prices:
      - Forward-fills localized trading halts up to `ffill_limit` sessions.
      - Gracefully removes invalid/delisted tickers and renormalizes weights.
      - Preserves warm-up history prior to `start_date` for MA200 / Walk-Forward lookback.
      - Inner-joins valid tickers with SPY to prevent IndexError & date misalignment (e.g., recent IPOs).
    """
    warnings: list[str] = []

    if wide_prices.is_empty() or "date" not in wide_prices.columns:
        raise ValueError("Không thể tải dữ liệu thị trường. Vui lòng kiểm tra kết nối mạng hoặc mã cổ phiếu.")

    wide_prices = wide_prices.sort("date")
    value_cols = [c for c in wide_prices.columns if c != "date"]
    wide_prices = wide_prices.with_columns(
        [pl.col(c).cast(pl.Float64).forward_fill(limit=ffill_limit) for c in value_cols]
    )

    if benchmark_ticker not in wide_prices.columns or wide_prices[benchmark_ticker].drop_nulls().is_empty():
        raise ValueError(f"Chỉ số chuẩn '{benchmark_ticker}' không có dữ liệu giá khả dụng.")

    # Separate valid vs invalid portfolio tickers
    valid_tickers: list[str] = []
    invalid_tickers: list[str] = []
    for t in requested_tickers:
        if t in wide_prices.columns and wide_prices[t].drop_nulls().len() >= 25:
            valid_tickers.append(t)
        else:
            invalid_tickers.append(t)

    if invalid_tickers:
        warnings.append(
            f"Đã loại bỏ các mã không hợp lệ hoặc thiếu lịch sử giao dịch: {', '.join(invalid_tickers)}. Tỷ trọng đã được tự động chuẩn hóa lại."
        )

    if not valid_tickers:
        raise ValueError("Không có mã cổ phiếu nào trong danh mục đủ dữ liệu lịch sử (>= 25 phiên giao dịch).")

    # Normalize weights cleanly for valid tickers
    w_arr = np.array([max(0.0, float(raw_weights.get(t, 0.0))) for t in valid_tickers], dtype=float)
    if w_arr.sum() <= 0:
        w_arr = np.ones(len(valid_tickers), dtype=float) / len(valid_tickers)
    else:
        w_arr = w_arr / w_arr.sum()

    # Keep full benchmark prices (including factor ETFs if present)
    benchmark_cols = ["date"] + [c for c in wide_prices.columns if c != "date"]
    benchmark_prices_full = wide_prices.select(benchmark_cols)

    # Extract portfolio tickers + SPY and compute daily returns on full history
    select_cols = ["date"] + list(dict.fromkeys(valid_tickers + [benchmark_ticker]))
    port_prices_full = wide_prices.select(select_cols)

    ret_exprs = [pl.col(c).pct_change().alias(c) for c in select_cols if c != "date"]
    port_returns_all = port_prices_full.select(["date"] + ret_exprs)

    # Inner-drop nulls ONLY across the valid portfolio tickers + SPY so all assets align by date
    # (If a newly IPO'd stock like ARM starts later, effective_start_date adjusts automatically!)
    aligned_full = port_returns_all.drop_nulls(subset=valid_tickers + [benchmark_ticker])

    if aligned_full.height < 20:
        raise ValueError("Số phiên giao dịch trùng khớp giữa các mã cổ phiếu quá ít (< 20 phiên).")

    earliest_common_date: dt.date = aligned_full["date"][0]
    latest_common_date: dt.date = aligned_full["date"][-1]

    if earliest_common_date > start_date:
        warnings.append(
            f"Ngày bắt đầu hiệu lực được tự động dời từ {start_date.isoformat()} sang {earliest_common_date.isoformat()} "
            f"do một số mã cổ phiếu có thời gian niêm yết ngắn hơn."
        )
        effective_start = earliest_common_date
    else:
        effective_start = start_date

    eval_df = aligned_full.filter(pl.col("date") >= effective_start)
    if eval_df.height < 10:
        raise ValueError("Khoảng thời gian đã chọn có ít hơn 10 phiên giao dịch trùng khớp.")

    actual_eval_start: dt.date = eval_df["date"][0]

    full_dates = aligned_full["date"].to_list()
    full_returns_matrix = aligned_full.select(valid_tickers).to_numpy()

    eval_dates = eval_df["date"].to_list()
    eval_returns_matrix = eval_df.select(valid_tickers).to_numpy()
    eval_spy_returns = eval_df[benchmark_ticker].to_numpy()

    # Locate exact index where evaluation window begins inside full_dates
    eval_start_idx = next(i for i, d in enumerate(full_dates) if d >= actual_eval_start)

    return PreparedMarketData(
        valid_tickers=valid_tickers,
        invalid_tickers=invalid_tickers,
        normalized_weights=w_arr,
        warnings=warnings,
        effective_start_date=actual_eval_start,
        end_date=latest_common_date,
        portfolio_prices_full=port_prices_full,
        portfolio_returns_full=aligned_full,
        benchmark_prices_full=benchmark_prices_full,
        eval_dates=eval_dates,
        eval_returns_matrix=eval_returns_matrix,
        eval_spy_returns=eval_spy_returns,
        full_dates=full_dates,
        full_returns_matrix=full_returns_matrix,
        eval_start_idx=eval_start_idx,
    )
