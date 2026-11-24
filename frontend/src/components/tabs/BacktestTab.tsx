import React from "react";
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

      {/* Bản đồ giá SPY tô màu theo Trạng thái Thị trường */}
      <PlotlyChart
        height={350}
        data={(["BULL", "NEUTRAL", "BEAR"] as const).map((state) => {
          const xs: string[] = [];
          const ys: number[] = [];
          backtest.regime_series.regime_state.forEach((st, idx) => {
            if (st === state) {
              xs.push(backtest.regime_series.dates[idx]);
              ys.push(backtest.regime_series.spy_price[idx]);
            }
          });
          return {
            type: "scatter" as const,
            mode: "markers" as const,
            name: REGIME_LABELS[state],
            x: xs,
            y: ys,
            marker: { color: REGIME_COLORS[state], size: 5 },
          };
        })}
        layout={{
          title: { text: "Phân Loại Trạng Thái Thị Trường Trên Giá SPY (Phân Vị Trượt 252 Phiên)" },
          yaxis: { title: { text: "Giá đóng cửa điều chỉnh SPY ($)" } },
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
