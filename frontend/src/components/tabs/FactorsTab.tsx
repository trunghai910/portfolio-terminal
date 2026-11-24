import React from "react";
import { CHART_COLORS, FACTOR_VI_LABELS } from "../../constants/terminal";
import type { AnalyzeResponse } from "../../types/portfolio";
import { formatSignedPct, getPnLTone, getPnLTrend } from "../../utils/format";
import { MetricCard } from "../MetricCard";
import { PlotlyChart } from "../PlotlyChart";

/**
 * Tab Phân Tích Nhân Tố (Multivariate OLS & CAPM):
 * - Hiển thị Alpha đa biến, Jensen's Alpha, R² và Treynor Ratio với căn phải tabular-nums.
 * - Gồm biểu đồ tải nhân tố trực giao hóa, lợi nhuận chủ động tích lũy, bảng OLS và xếp hạng Beta 60 phiên.
 */
export const FactorsTab: React.FC<{ data: AnalyzeResponse }> = ({ data }) => {
  const { factors } = data;
  const betaValues = factors.factor_loadings.map((f) => f.beta);
  const minBeta = Math.min(0, ...betaValues);
  const maxBeta = Math.max(0, ...betaValues);
  const betaSpan = Math.max(maxBeta - minBeta, 0.5);
  const factorYRange: [number, number] = [minBeta - betaSpan * 0.28, maxBeta + betaSpan * 0.22];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          featured
          label="Alpha Đa Biến (Năm Hóa)"
          value={formatSignedPct(factors.multivariate_alpha_annual_pct)}
          subtext="Hệ số chặn hồi quy OLS đồng thời"
          tone={getPnLTone(factors.multivariate_alpha_annual_pct)}
          trend={getPnLTrend(factors.multivariate_alpha_annual_pct)}
        />
        <MetricCard
          label="Jensen's Alpha (CAPM)"
          value={formatSignedPct(factors.capm_alpha_annual_pct)}
          subtext={`Lãi suất phi rủi ro Rf = ${(data.meta.risk_free_rate * 100).toFixed(2)}%/năm`}
          tone={getPnLTone(factors.capm_alpha_annual_pct)}
          trend={getPnLTrend(factors.capm_alpha_annual_pct)}
        />
        <MetricCard
          label="Hệ Số Xác Định R²"
          value={`${(factors.r_squared * 100).toFixed(1)}%`}
          subtext="Mức độ giải thích phương sai danh mục"
          tone="info"
        />
        <MetricCard
          label="Tỷ Số Treynor"
          value={factors.treynor_ratio.toFixed(3)}
          subtext="Lợi nhuận vượt trội / đơn vị Beta CAPM"
        />
      </div>

      {/* Hệ số tải nhân tố OLS trực giao hóa & Phân bổ lợi nhuận chủ động */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlotlyChart
          height={360}
          data={[
            {
              type: "bar",
              name: "Beta OLS Đa Biến",
              x: factors.factor_loadings.map((f) => f.factor),
              y: factors.factor_loadings.map((f) => f.beta),
              text: factors.factor_loadings.map((f) => {
                const displayBeta = Math.abs(f.beta) < 0.005 ? 0 : f.beta;
                const displayT = Math.abs(f.t_stat) < 0.005 ? 0 : f.t_stat;
                return `${displayBeta.toFixed(2)} (t=${displayT.toFixed(2)})`;
              }),
              textposition: "outside",
              textfont: {
                family: '"JetBrains Mono", monospace',
                size: 11,
                color: CHART_COLORS.textSecondary,
              },
              cliponaxis: false,
              marker: {
                color: factors.factor_loadings.map((f) =>
                  Math.abs(f.beta) < 0.005
                    ? CHART_COLORS.mutedLine
                    : f.beta > 0
                      ? CHART_COLORS.accent
                      : CHART_COLORS.loss
                ),
              },
            },
          ]}
          layout={{
            title: { text: "Hệ Số Tải Nhân Tố OLS Đa Biến (Đã Trực Giao Hóa)" },
            yaxis: {
              title: { text: "Hệ số Beta nhân tố" },
              range: factorYRange,
              zeroline: true,
              zerolinecolor: CHART_COLORS.zeroLine,
              zerolinewidth: 1.5,
              automargin: true,
            },
            xaxis: { automargin: true },
            margin: { t: 76, b: 64 },
            hovermode: "closest",
          }}
        />

        <PlotlyChart
          height={360}
          data={[
            {
              type: "scatter",
              mode: "lines",
              fill: "tozeroy",
              fillcolor: "rgba(34, 197, 94, 0.12)",
              name: "Lợi nhuận chủ động tích lũy (%)",
              x: factors.active_attribution.dates,
              y: factors.active_attribution.cumulative_active,
              line: { color: CHART_COLORS.gain, width: 2 },
            },
          ]}
          layout={{
            title: { text: "Phân Bổ Lợi Nhuận Chủ Động Tích Lũy So Với SPY (%)" },
            yaxis: { title: { text: "Lợi nhuận chủ động (%)" } },
          }}
        />
      </div>

      {/* Bảng thống kê hồi quy nhân tố */}
      <div className="fintech-table-wrap">
        <div className="fintech-table-header">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-terminal-text">
            Bảng Kết Quả Hồi Quy Nhân Tố Đa Biến (OLS Đã Khử Đa Cộng Tuyến)
          </h3>
          <span className="text-[11px] text-terminal-muted">
            |t-stat| &ge; 2.00: Có ý nghĩa thống kê ở mức ~95%
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-terminal-border bg-terminal-elevated/40">
              <tr>
                <th className="fintech-th">Mã Nhân Tố</th>
                <th className="fintech-th">Ý Nghĩa Kinh Tế (Nhân Tố Chênh Lệch Trực Giao)</th>
                <th className="fintech-th text-right">Beta OLS Đa Biến</th>
                <th className="fintech-th text-right">Thống Kê t (t-stat)</th>
                <th className="fintech-th text-right">Beta Đơn Biến</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/70">
              {factors.factor_loadings.map((f) => (
                <tr key={f.factor} className="transition-colors hover:bg-terminal-elevated/50">
                  <td className="px-4 py-2.5 font-mono font-semibold text-terminal-accent">
                    {f.factor}
                  </td>
                  <td className="px-4 py-2.5 text-terminal-secondary">
                    {FACTOR_VI_LABELS[f.factor] ?? f.label}
                  </td>
                  <td className="fintech-td-num font-semibold text-terminal-text">
                    {f.beta.toFixed(4)}
                  </td>
                  <td
                    className={`fintech-td-num ${
                      Math.abs(f.t_stat) >= 2.0 ? "font-semibold text-pnl-gain" : "text-terminal-muted"
                    }`}
                  >
                    {f.t_stat.toFixed(2)}
                  </td>
                  <td className="fintech-td-num text-terminal-muted">
                    {f.univariate_beta.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bản đồ nhiệt Beta trượt 60 phiên & Xếp hạng Beta hiện tại */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PlotlyChart
            height={340}
            data={[
              {
                type: "heatmap",
                x: factors.rolling_beta_heatmap.dates,
                y: factors.rolling_beta_heatmap.tickers,
                z: factors.rolling_beta_heatmap.z,
                colorscale: "YlGnBu",
              },
            ]}
            layout={{
              title: { text: "Bản Đồ Nhiệt Beta Trượt 60 Phiên Của Từng Cổ Phiếu (so với SPY)" },
              hovermode: "closest",
            }}
          />
        </div>

        <div className="fintech-table-wrap flex flex-col">
          <div className="border-b border-terminal-border bg-terminal-elevated/70 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-terminal-text">
              Xếp Hạng Beta 60 Phiên Hiện Tại
            </h3>
            <p className="mt-0.5 text-[11px] text-terminal-muted">
              Độ nhạy thị trường mới nhất so với SPY
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-terminal-border bg-terminal-elevated/40">
                <tr>
                  <th className="fintech-th">#</th>
                  <th className="fintech-th">Mã</th>
                  <th className="fintech-th text-right">Beta 60 Phiên</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border/70">
                {factors.ranked_betas.map((item, idx) => (
                  <tr key={item.ticker} className="transition-colors hover:bg-terminal-elevated/50">
                    <td className="num-tabular px-4 py-2.5 font-mono text-terminal-muted">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-terminal-text">
                      {item.ticker}
                    </td>
                    <td
                      className={`fintech-td-num font-semibold ${
                        item.beta > 1.2
                          ? "text-pnl-warn"
                          : item.beta < 0.8
                            ? "text-pnl-gain"
                            : "text-terminal-accent"
                      }`}
                    >
                      {item.beta.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
