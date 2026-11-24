import React from "react";
import { CHART_COLORS } from "../../constants/terminal";
import type { AnalyzeResponse } from "../../types/portfolio";
import { MetricCard } from "../MetricCard";
import { PlotlyChart } from "../PlotlyChart";

/**
 * Tab Phân Tích Rủi Ro:
 * - Hàng KPI rủi ro cốt lõi: Độ biến động năm, Max Drawdown, VaR 95% và CVaR/ES 95%.
 * - Trực quan hóa tương quan, phân phối lợi nhuận ngày, Drawdown, Volatility trượt, Beta trượt & Động lượng 12-1.
 */
export const RiskTab: React.FC<{ data: AnalyzeResponse }> = ({ data }) => {
  const { kpis } = data.portfolio;
  const { risk } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Độ Biến Động Năm Hóa"
          value={`${kpis.annual_volatility.toFixed(2)}%`}
          details={[{ label: "Beta trượt 20 phiên", value: kpis.rolling_beta_latest.toFixed(2) }]}
        />
        <MetricCard
          label="Mức Sụt Giảm Tối Đa"
          value={`${kpis.max_drawdown.toFixed(2)}%`}
          subtext="Sụt giảm đỉnh - đáy (Max Drawdown)"
          tone="negative"
          trend="down"
        />
        <MetricCard
          label="VaR Ngày (Độ Tin Cậy 95%)"
          value={`${kpis.var_95.toFixed(2)}%`}
          subtext="Phân vị lợi nhuận lịch sử thứ 5%"
          tone="warning"
        />
        <MetricCard
          label="CVaR / ES Ngày (95%)"
          value={`${kpis.cvar_95.toFixed(2)}%`}
          subtext="Tổn thất kỳ vọng vượt ngưỡng VaR"
          tone="negative"
          trend="down"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlotlyChart
          height={350}
          data={[
            {
              type: "heatmap",
              x: risk.correlation_matrix.tickers,
              y: risk.correlation_matrix.tickers,
              z: risk.correlation_matrix.values,
              colorscale: "RdBu",
              zmin: -1,
              zmax: 1,
              text: risk.correlation_matrix.values.map((row) =>
                row.map((v) => v.toFixed(2))
              ) as unknown as string[],
              texttemplate: "%{text}",
            },
          ]}
          layout={{ title: { text: "Ma Trận Tương Quan Lợi Nhuận Tài Sản" }, hovermode: "closest" }}
        />

        <PlotlyChart
          height={350}
          data={[
            {
              type: "histogram",
              x: risk.daily_returns,
              nbinsx: 50,
              marker: {
                color: CHART_COLORS.accent,
                line: { color: CHART_COLORS.canvasBg, width: 0.6 },
              },
              name: "Lợi nhuận ngày (%)",
            },
          ]}
          layout={{
            title: { text: "Phân Phối Lợi Nhuận Ròng Hàng Ngày (%)" },
            xaxis: { title: { text: "Lợi nhuận ngày (%)" } },
            yaxis: { title: { text: "Số phiên giao dịch" } },
          }}
        />
      </div>

      <PlotlyChart
        height={340}
        data={[
          {
            type: "scatter",
            mode: "lines",
            fill: "tozeroy",
            fillcolor: "rgba(239, 68, 68, 0.14)",
            name: "Sụt giảm danh mục (%)",
            x: risk.dates,
            y: risk.portfolio_drawdown,
            line: { color: CHART_COLORS.loss, width: 1.9 },
          },
          {
            type: "scatter",
            mode: "lines",
            name: "Sụt giảm SPY (%)",
            x: risk.dates,
            y: risk.spy_drawdown,
            line: { color: CHART_COLORS.benchmark, width: 1.5, dash: "dot" },
          },
        ]}
        layout={{
          title: { text: "So Sánh Mức Sụt Giảm Từ Đỉnh (Drawdown %)" },
          yaxis: { title: { text: "Mức sụt giảm (%)" } },
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlotlyChart
          height={330}
          data={[
            {
              type: "scatter",
              mode: "lines",
              name: "Biến động 20 phiên Danh mục (%)",
              x: risk.dates,
              y: risk.portfolio_rolling_vol,
              line: { color: CHART_COLORS.accent, width: 1.9 },
            },
            {
              type: "scatter",
              mode: "lines",
              name: "Biến động 20 phiên SPY (%)",
              x: risk.dates,
              y: risk.spy_rolling_vol,
              line: { color: CHART_COLORS.benchmark, width: 1.5, dash: "dash" },
            },
          ]}
          layout={{
            title: { text: "Độ Biến Động Trượt 20 Phiên (Năm Hóa %)" },
            yaxis: { title: { text: "Độ biến động (%)" } },
          }}
        />

        <PlotlyChart
          height={330}
          data={[
            {
              type: "scatter",
              mode: "lines",
              name: "Beta trượt 20 phiên so với SPY",
              x: risk.rolling_beta_dates,
              y: risk.rolling_beta,
              line: { color: CHART_COLORS.purple, width: 1.9 },
            },
          ]}
          layout={{
            title: { text: "Hệ Số Beta Thị Trường Trượt 20 Phiên (so với SPY)" },
            yaxis: { title: { text: "Hệ số Beta" } },
            shapes: [
              {
                type: "line",
                xref: "paper",
                x0: 0,
                x1: 1,
                y0: 1,
                y1: 1,
                line: { color: CHART_COLORS.mutedLine, width: 1, dash: "dash" },
              },
            ],
          }}
        />
      </div>

      <PlotlyChart
        height={310}
        data={[
          {
            type: "scatter",
            mode: "lines",
            name: "Tương quan trượt 20 phiên với Động lượng 12-1",
            x: risk.momentum_corr_dates,
            y: risk.momentum_corr,
            line: { color: CHART_COLORS.warn, width: 1.9 },
          },
        ]}
        layout={{
          title: {
            text: "Mức Độ Phơi Nhiễm Nhân Tố Động Lượng 12-1 Tháng (Tương Quan Trượt 20 Phiên)",
          },
          yaxis: { title: { text: "Hệ số tương quan" }, range: [-1, 1] },
          shapes: [
            {
              type: "line",
              xref: "paper",
              x0: 0,
              x1: 1,
              y0: 0,
              y1: 0,
              line: { color: CHART_COLORS.mutedLine, width: 1, dash: "dash" },
            },
          ],
        }}
      />
    </div>
  );
};
