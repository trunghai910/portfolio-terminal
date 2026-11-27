import React from "react";
import type Plotly from "plotly.js";
import { CHART_COLORS, REGIME_COLORS, REGIME_LABELS } from "../../constants/terminal";
import type { AnalyzeResponse } from "../../types/portfolio";
import {
  formatCurrencyUSD,
  formatDateVN,
  formatSignedPct,
  getPnLTone,
  getPnLTrend,
} from "../../utils/format";
import { MetricCard } from "../MetricCard";
import { PlotlyChart } from "../PlotlyChart";

const REGIME_BAND_FILL: Record<string, string> = {
  BULL: "rgba(34, 197, 94, 0.09)",
  NEUTRAL: "rgba(245, 158, 11, 0.18)",
  BEAR: "rgba(239, 68, 68, 0.24)",
};

/**
 * Tab Kiểm Thử Chiến Lược Walk-Forward:
 * - So sánh lợi nhuận ròng, chi phí ăn mòn và tỷ lệ vòng quay danh mục.
 * - Hiển thị đường tăng trưởng Out-of-Sample, bản đồ trạng thái thị trường trên SPY và nhật ký 20 phiên gần nhất.
 */
export const BacktestTab: React.FC<{ data: AnalyzeResponse }> = ({ data }) => {
  const { backtest } = data;
  const s = backtest.summary;
  const costDragFormatted =
    s.total_cost_drag > 0 ? `-${s.total_cost_drag.toFixed(2)}%` : "0.00%";

  // Gom các phiên liên tiếp cùng trạng thái thành từng dải nền dọc (Regime Bands)
  const regimeDates = backtest.regime_series.dates;
  const regimeStates = backtest.regime_series.regime_state;
  const regimeShapes: NonNullable<Plotly.Layout["shapes"]> = [];
  if (regimeDates.length > 0) {
    let runStart = 0;
    for (let i = 1; i <= regimeStates.length; i++) {
      if (i === regimeStates.length || regimeStates[i] !== regimeStates[runStart]) {
        const state = regimeStates[runStart];
        const endIdx = Math.min(i, regimeDates.length - 1);
        regimeShapes.push({
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: regimeDates[runStart],
          x1: regimeDates[endIdx],
          y0: 0,
          y1: 1,
          fillcolor: REGIME_BAND_FILL[state] ?? "rgba(148, 163, 184, 0.08)",
          line: { width: 0 },
          layer: "below",
        });
        runStart = i;
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          featured
          label="Lợi Nhuận Ròng Walk-Forward"
          value={formatSignedPct(s.wf_regime_net_return)}
          tone={getPnLTone(s.wf_regime_net_return)}
          trend={getPnLTrend(s.wf_regime_net_return)}
          details={[
            {
              label: "Trước phí (Gộp)",
              value: formatSignedPct(s.wf_regime_gross_return),
              tone: getPnLTone(s.wf_regime_gross_return),
            },
          ]}
        />
        <MetricCard
          label="Sharpe Ròng Walk-Forward"
          value={s.wf_regime_net_sharpe.toFixed(2)}
          tone="info"
          details={[
            {
              label: "Sụt giảm tối đa",
              value: `${s.wf_regime_max_dd.toFixed(2)}%`,
              tone: "negative",
            },
          ]}
        />
        <MetricCard
          label="Tỷ Lệ Vòng Quay Năm Hóa"
          value={`${s.annualized_turnover.toFixed(1)}%`}
          subtext="Tái cân bằng + Chuyển trạng thái"
          tone="warning"
        />
        <MetricCard
          label="Chi Phí Giao Dịch Ăn Mòn"
          value={costDragFormatted}
          subtext="Tổng phí GD + trượt giá tích lũy"
          tone={s.total_cost_drag > 0 ? "negative" : "default"}
          trend={s.total_cost_drag > 0 ? "down" : "flat"}
        />
      </div>

      {/* Đường tăng trưởng Walk-Forward Gộp vs Ròng vs Tĩnh vs SPY */}
      <PlotlyChart
        height={400}
        data={[
          {
            type: "scatter",
            mode: "lines",
            name: "Walk-Forward Regime (Ròng)",
            x: backtest.dates,
            y: backtest.wf_regime_net,
            line: { color: CHART_COLORS.gain, width: 2.3 },
          },
          {
            type: "scatter",
            mode: "lines",
            name: "Walk-Forward Regime (Gộp)",
            x: backtest.dates,
            y: backtest.wf_regime_gross,
            line: { color: CHART_COLORS.gain, width: 1.4, dash: "dot" },
          },
          {
            type: "scatter",
            mode: "lines",
            name: "Danh mục tĩnh (Ròng)",
            x: backtest.dates,
            y: backtest.static_net,
            line: { color: CHART_COLORS.accent, width: 2 },
          },
          {
            type: "scatter",
            mode: "lines",
            name: "Chỉ số chuẩn SPY",
            x: backtest.dates,
            y: backtest.spy,
            line: { color: CHART_COLORS.benchmark, width: 1.6, dash: "dash" },
          },
        ]}
        layout={{
          title: {
            text: "Kiểm Thử Walk-Forward Chuyển Trạng Thái Nhân Quả (Trễ 1 Phiên • Tiền Mặt Hưởng Rf)",
          },
          yaxis: { title: { text: "Giá trị tăng trưởng của $1" } },
        }}
      />

      {/* Bản đồ giá SPY với dải nền phân vùng Trạng thái Thị trường + đường giá liên tục */}
      <PlotlyChart
        height={400}
        data={[
          {
            type: "scatter",
            mode: "lines",
            name: "Giá đóng cửa SPY ($)",
            x: backtest.regime_series.dates,
            y: backtest.regime_series.spy_price,
            line: { color: "#f8fafc", width: 2 },
            customdata: backtest.regime_series.regime_state.map((st, idx) => [
              REGIME_LABELS[st] ?? st,
              backtest.regime_series.regime_score[idx] ?? 0.5,
            ]),
            hovertemplate:
              "<b>SPY:</b> $%{y:,.2f}<br><b>Trạng thái:</b> %{customdata[0]} (Điểm: %{customdata[1]:.2f})<extra></extra>",
          },
          ...(["BULL", "NEUTRAL", "BEAR"] as const).map((state) => ({
            type: "scatter" as const,
            mode: "markers" as const,
            name: `Vùng ${REGIME_LABELS[state]}`,
            x: [null],
            y: [null],
            marker: {
              symbol: "square",
              size: 10,
              color: REGIME_COLORS[state],
            },
            hoverinfo: "skip" as const,
          })),
        ]}
        layout={{
          title: { text: "Phân Loại Trạng Thái Thị Trường Trên Giá SPY (Phân Vị Trượt 252 Phiên)" },
          yaxis: { title: { text: "Giá đóng cửa điều chỉnh SPY ($)" } },
          shapes: regimeShapes,
        }}
      />

      {/* Bảng kiểm toán Trạng thái & Vòng quay gần nhất */}
      <div className="fintech-table-wrap">
        <div className="fintech-table-header">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-terminal-text">
            Nhật Ký Trạng Thái Thị Trường &amp; Vòng Quay Danh Mục ({backtest.recent_regime_rows.length}{" "}
            Phiên Gần Nhất)
          </h3>
          <span className="text-[11px] text-terminal-muted">
            Điểm &ge; 0.70: TĂNG &bull; Điểm &le; 0.35: GIẢM &bull; Còn lại: TRUNG TÍNH
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-terminal-border bg-terminal-elevated/40">
              <tr>
                <th className="fintech-th">Ngày</th>
                <th className="fintech-th text-right">Giá Đóng Cửa SPY</th>
                <th className="fintech-th text-right">Điểm Trạng Thái</th>
                <th className="fintech-th text-center">Trạng Thái Thị Trường</th>
                <th className="fintech-th text-right">Vòng Quay Trong Phiên (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/70">
              {[...backtest.recent_regime_rows].reverse().map((row) => (
                <tr key={row.date} className="transition-colors hover:bg-terminal-elevated/50">
                  <td className="num-tabular whitespace-nowrap px-4 py-2.5 font-mono text-terminal-secondary">
                    {formatDateVN(row.date)}
                  </td>
                  <td className="fintech-td-num font-medium text-terminal-text">
                    {formatCurrencyUSD(row.spy_price)}
                  </td>
                  <td className="fintech-td-num text-terminal-secondary">
                    {row.score.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold"
                      style={{
                        backgroundColor: `${REGIME_COLORS[row.regime]}1f`,
                        borderColor: `${REGIME_COLORS[row.regime]}44`,
                        color: REGIME_COLORS[row.regime],
                      }}
                    >
                      <span aria-hidden="true">
                        {row.regime === "BULL" ? "▲" : row.regime === "BEAR" ? "▼" : "●"}
                      </span>
                      {REGIME_LABELS[row.regime]}
                    </span>
                  </td>
                  <td className="fintech-td-num text-terminal-secondary">
                    {row.turnover_pct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
