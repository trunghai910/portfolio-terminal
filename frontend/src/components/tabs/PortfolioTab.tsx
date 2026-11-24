import React from "react";
import { CHART_COLORS, OPT_METHOD_LABELS, REGIME_LABELS } from "../../constants/terminal";
import type { AnalyzeResponse } from "../../types/portfolio";
import { formatSignedPct, getPnLTone, getPnLTrend } from "../../utils/format";
import { MetricCard } from "../MetricCard";
import { PlotlyChart } from "../PlotlyChart";

/**
 * Tab Tổng Quan Danh Mục:
 * - Tầng 1 (Hero KPI): Làm nổi bật Lợi nhuận ròng & Hiệu suất chủ động so với SPY.
 * - Tầng 2 (Chất lượng hiệu suất): Sharpe, CAPM Alpha và Trạng thái thị trường.
 * - Tầng 3: Biểu đồ phân bổ tỷ trọng, đường tăng trưởng $1 và Đường biên hiệu quả Monte Carlo.
 */
export const PortfolioTab: React.FC<{ data: AnalyzeResponse }> = ({ data }) => {
  const { kpis, current_allocation, optimized_allocation, equity_curves, efficient_frontier } =
    data.portfolio;

  const regimeTone =
    kpis.current_regime === "BULL"
      ? "positive"
      : kpis.current_regime === "BEAR"
        ? "negative"
        : "warning";

  const regimeTrend =
    kpis.current_regime === "BULL"
      ? "up"
      : kpis.current_regime === "BEAR"
        ? "down"
        : "flat";

  const optLabel = OPT_METHOD_LABELS[data.meta.optimization_method] ?? data.meta.optimization_method;

  const capmBeta =
    data.factors.factor_loadings.find((f) => f.factor === "MKT")?.univariate_beta ??
    kpis.rolling_beta_latest;

  return (
    <div className="space-y-6">
      {/* Tầng 1: Hai Hero KPI trọng tâm */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MetricCard
          featured
          label="Lợi Nhuận Ròng Danh Mục"
          value={formatSignedPct(kpis.total_return)}
          tone={getPnLTone(kpis.total_return)}
          trend={getPnLTrend(kpis.total_return)}
          details={[
            {
              label: "Tăng trưởng kép năm (CAGR)",
              value: `${formatSignedPct(kpis.cagr)}/năm`,
              tone: getPnLTone(kpis.cagr),
            },
            {
              label: "Độ biến động năm hóa",
              value: `${kpis.annual_volatility.toFixed(2)}%`,
            },
          ]}
        />

        <MetricCard
          featured
          label="Lợi Nhuận Chủ Động vs SPY"
          value={formatSignedPct(kpis.active_return)}
          tone={getPnLTone(kpis.active_return)}
          trend={getPnLTrend(kpis.active_return)}
          details={[
            {
              label: "Chỉ số chuẩn SPY (cùng kỳ)",
              value: formatSignedPct(kpis.spy_total_return),
              tone: getPnLTone(kpis.spy_total_return),
            },
            {
              label: "Mức sụt giảm tối đa (Max DD)",
              value: `${kpis.max_drawdown.toFixed(2)}%`,
              tone: "negative",
            },
          ]}
        />
      </div>

      {/* Tầng 2: Ba KPI chất lượng lợi nhuận & bối cảnh thị trường */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Tỷ Số Sharpe (có Rf)"
          value={kpis.sharpe_ratio.toFixed(2)}
          tone={kpis.sharpe_ratio >= 1 ? "positive" : kpis.sharpe_ratio < 0 ? "negative" : "default"}
          details={[
            { label: "Sortino Ratio", value: kpis.sortino_ratio.toFixed(2) },
            { label: "Calmar Ratio", value: kpis.calmar_ratio.toFixed(2) },
          ]}
        />

        <MetricCard
          label="CAPM Alpha (Năm Hóa)"
          value={formatSignedPct(kpis.capm_alpha)}
          tone={getPnLTone(kpis.capm_alpha)}
          trend={getPnLTrend(kpis.capm_alpha)}
          details={[
            { label: "Beta CAPM (toàn kỳ)", value: capmBeta.toFixed(2) },
            { label: "Tỷ số Treynor", value: kpis.treynor_ratio.toFixed(3) },
          ]}
        />

        <MetricCard
          label="Trạng Thái Thị Trường"
          value={REGIME_LABELS[kpis.current_regime]}
          tone={regimeTone}
          trend={regimeTrend}
          details={[
            { label: "Điểm trạng thái tổng hợp", value: kpis.current_regime_score.toFixed(2) },
            { label: "Phơi nhiễm Động lượng 12-1", value: kpis.momentum_12_1_exposure.toFixed(2) },
          ]}
        />
      </div>

      {/* Phân bổ hiện tại vs Phân bổ tối ưu */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlotlyChart
          height={320}
          data={[
            {
              type: "pie",
              hole: 0.5,
              labels: current_allocation.map((a) => a.ticker),
              values: current_allocation.map((a) => a.weight),
              textinfo: "label+percent",
              marker: {
                colors: [...CHART_COLORS.pieCurrent],
                line: { color: CHART_COLORS.cardBg, width: 2 },
              },
            },
          ]}
          layout={{ title: { text: "Phân Bổ Danh Mục Hiện Tại" }, showlegend: false }}
        />

        <PlotlyChart
          height={320}
          data={[
            {
              type: "pie",
              hole: 0.5,
              labels: optimized_allocation.map((a) => a.ticker),
              values: optimized_allocation.map((a) => a.weight),
              textinfo: "label+percent",
              marker: {
                colors: [...CHART_COLORS.pieOptimized],
                line: { color: CHART_COLORS.cardBg, width: 2 },
              },
            },
          ]}
          layout={{
            title: {
              text: `Phân Bổ Tối Ưu (${optLabel} | Sharpe: ${kpis.optimized_sharpe.toFixed(2)})`,
            },
            showlegend: false,
          }}
        />
      </div>

      {/* Biểu đồ tăng trưởng so sánh 4 đường */}
      <PlotlyChart
        height={400}
        data={[
          {
            type: "scatter",
            mode: "lines",
            name: "Danh mục hiện tại (Ròng)",
            x: equity_curves.dates,
            y: equity_curves.current_portfolio,
            line: { color: CHART_COLORS.accent, width: 2.3 },
          },
          {
            type: "scatter",
            mode: "lines",
            name: "Walk-Forward Regime (Ngoài mẫu Ròng)",
            x: equity_curves.dates,
            y: equity_curves.walk_forward_net,
            line: { color: CHART_COLORS.gain, width: 2.3 },
          },
          {
            type: "scatter",
            mode: "lines",
            name: "Danh mục tối ưu (Tham chiếu trong mẫu)",
            x: equity_curves.dates,
            y: equity_curves.optimized_in_sample,
            line: { color: CHART_COLORS.warn, width: 1.6, dash: "dot" },
          },
          {
            type: "scatter",
            mode: "lines",
            name: "Chỉ số chuẩn SPY",
            x: equity_curves.dates,
            y: equity_curves.spy,
            line: { color: CHART_COLORS.benchmark, width: 1.8, dash: "dash" },
          },
        ]}
        layout={{
          title: {
            text: "Tăng Trưởng Của $1: Danh Mục Hiện Tại vs Walk-Forward (OOS) vs Tối Ưu vs SPY",
          },
          yaxis: { title: { text: "Giá trị tăng trưởng ($)" } },
        }}
      />

      {/* Đường biên hiệu quả Monte Carlo */}
      <PlotlyChart
        height={430}
        data={[
          {
            type: "scatter",
            mode: "markers",
            name: "Danh mục mô phỏng (Monte Carlo)",
            x: efficient_frontier.mc_volatility,
            y: efficient_frontier.mc_return,
            marker: {
              size: 4,
              opacity: 0.45,
              color: efficient_frontier.mc_sharpe,
              colorscale: "Viridis",
              showscale: true,
              colorbar: { title: { text: "Sharpe" }, thickness: 12 },
            },
          },
          {
            type: "scatter",
            mode: "text+markers",
            name: "Tài sản thành phần",
            x: efficient_frontier.assets.map((a) => a.volatility_pct),
            y: efficient_frontier.assets.map((a) => a.return_pct),
            text: efficient_frontier.assets.map((a) => a.ticker),
            textposition: "top center",
            textfont: {
              family: '"JetBrains Mono", monospace',
              size: 11,
              color: CHART_COLORS.textPrimary,
            },
            marker: { size: 10, symbol: "diamond", color: CHART_COLORS.textPrimary },
          },
          {
            type: "scatter",
            mode: "markers",
            name: "Danh mục hiện tại",
            x: [efficient_frontier.current_point.volatility_pct],
            y: [efficient_frontier.current_point.return_pct],
            marker: {
              size: 14,
              symbol: "circle",
              color: CHART_COLORS.accent,
              line: { width: 2, color: CHART_COLORS.textPrimary },
            },
          },
          {
            type: "scatter",
            mode: "markers",
            name: `Danh mục tối ưu (${optLabel})`,
            x: [efficient_frontier.optimal_point.volatility_pct],
            y: [efficient_frontier.optimal_point.return_pct],
            marker: { size: 18, symbol: "star", color: CHART_COLORS.loss },
          },
        ]}
        layout={{
          title: {
            text: `Đường Biên Hiệu Quả Monte Carlo & Điểm Tối Ưu (${optLabel})`,
          },
          xaxis: { title: { text: "Độ biến động năm hóa (%)" } },
          yaxis: { title: { text: "Lợi nhuận kỳ vọng năm hóa (%)" } },
          hovermode: "closest",
        }}
      />
    </div>
  );
};
