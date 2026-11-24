import React from "react";
import { CHART_COLORS, SIGNAL_LABELS } from "../../constants/terminal";
import type { AnalyzeResponse } from "../../types/portfolio";
import { formatDateVN } from "../../utils/format";
import { MetricCard } from "../MetricCard";
import { PlotlyChart } from "../PlotlyChart";

/**
 * Tab Tín Hiệu Giao Dịch (MA20 / MA50):
 * - Đồng bộ hóa đơn vị % trên KPI, biểu đồ lịch sử (kèm 2 ngưỡng 45% và 55%) và bảng kiểm toán 20 phiên gần nhất.
 */
export const SignalsTab: React.FC<{ data: AnalyzeResponse }> = ({ data }) => {
  const { signals, meta } = data;
  const sigTone =
    signals.current_signal === "BUY"
      ? "positive"
      : signals.current_signal === "SELL"
        ? "negative"
        : "warning";

  const sigTrend =
    signals.current_signal === "BUY"
      ? "up"
      : signals.current_signal === "SELL"
        ? "down"
        : "flat";

  const signalSeriesPct = signals.portfolio_signal_series.map((v) =>
    Number((v * 100).toFixed(2))
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          featured
          label="Khuyến Nghị Xu Hướng Danh Mục"
          value={SIGNAL_LABELS[signals.current_signal]}
          subtext="Tổng hợp xu hướng MA20 vs MA50 theo tỷ trọng"
          tone={sigTone}
          trend={sigTrend}
        />
        <MetricCard
          label="Tỷ Trọng Trong Xu Hướng Tăng"
          value={`${(signals.latest_score * 100).toFixed(1)}%`}
          subtext="Ngưỡng quyết định: MUA > 55% | BÁN < 45%"
          tone="info"
        />
        <MetricCard
          label="Số Mã Thành Phần Hợp Lệ"
          value={`${meta.valid_tickers.length} mã`}
          subtext={meta.valid_tickers.join(", ")}
        />
      </div>

      <PlotlyChart
        height={350}
        data={[
          {
            type: "scatter",
            mode: "lines",
            fill: "tozeroy",
            fillcolor: "rgba(34, 197, 94, 0.12)",
            name: "Điểm tín hiệu theo tỷ trọng (%)",
            x: signals.dates,
            y: signalSeriesPct,
            line: { color: CHART_COLORS.gain, width: 2 },
          },
        ]}
        layout={{
          title: {
            text: "Lịch Sử Điểm Tín Hiệu Xu Hướng Danh Mục (% Tỷ Trọng Có MA20 > MA50)",
          },
          yaxis: { title: { text: "Điểm tín hiệu (%)" }, range: [-5, 105] },
          shapes: [
            {
              type: "line",
              xref: "paper",
              x0: 0,
              x1: 1,
              y0: 55,
              y1: 55,
              line: { color: CHART_COLORS.gain, width: 1.2, dash: "dash" },
            },
            {
              type: "line",
              xref: "paper",
              x0: 0,
              x1: 1,
              y0: 45,
              y1: 45,
              line: { color: CHART_COLORS.loss, width: 1.2, dash: "dash" },
            },
          ],
        }}
      />

      <div className="fintech-table-wrap">
        <div className="fintech-table-header">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-terminal-text">
            Trạng Thái Xu Hướng MA20 / MA50 Theo Mã ({signals.recent_rows.length} Phiên Gần Nhất)
          </h3>
          <span className="text-[11px] text-terminal-muted">
            MA20 &gt; MA50: Xu hướng ngắn hạn tích cực &bull; MA20 &le; MA50: Xu hướng suy yếu
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-terminal-border bg-terminal-elevated/40">
              <tr>
                <th className="fintech-th">Ngày</th>
                {meta.valid_tickers.map((t) => (
                  <th key={t} className="fintech-th text-center font-mono">
                    {t}
                  </th>
                ))}
                <th className="fintech-th text-right">Điểm Tín Hiệu (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/70">
              {[...signals.recent_rows].reverse().map((row) => (
                <tr key={String(row.date)} className="transition-colors hover:bg-terminal-elevated/50">
                  <td className="num-tabular whitespace-nowrap px-4 py-2.5 font-mono text-terminal-secondary">
                    {formatDateVN(String(row.date))}
                  </td>
                  {meta.valid_tickers.map((t) => {
                    const isBull = Number(row[t]) === 1;
                    return (
                      <td key={t} className="px-4 py-2.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${
                            isBull
                              ? "border-pnl-gain/25 bg-pnl-gain/15 text-pnl-gain"
                              : "border-pnl-loss/25 bg-pnl-loss/15 text-pnl-loss"
                          }`}
                        >
                          <span aria-hidden="true">{isBull ? "▲" : "▼"}</span>
                          {isBull ? "MA20 > MA50" : "MA20 ≤ MA50"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="fintech-td-num font-semibold text-terminal-accent">
                    {(Number(row.score) * 100).toFixed(1)}%
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
