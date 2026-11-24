import React, { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";

interface PlotlyChartProps {
  data: (Partial<Plotly.PlotData> & Record<string, unknown>)[];
  layout?: Partial<Plotly.Layout>;
  height?: number;
}

const DEFAULT_TITLE_FONT = {
  size: 14,
  color: "#f8fafc",
  family: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
};

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "rgba(14, 21, 37, 0)",
  plot_bgcolor: "rgba(8, 13, 26, 0.65)",
  font: {
    color: "#cbd5e1",
    family: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    size: 12,
  },
  margin: { l: 60, r: 24, t: 84, b: 52 },
  title: { font: DEFAULT_TITLE_FONT, y: 0.96, yanchor: "top", x: 0.02, xanchor: "left" },
  xaxis: {
    gridcolor: "rgba(30, 41, 59, 0.75)",
    zerolinecolor: "#334155",
    tickfont: { family: '"JetBrains Mono", monospace', size: 11, color: "#94a3b8" },
    automargin: true,
  },
  yaxis: {
    gridcolor: "rgba(30, 41, 59, 0.75)",
    zerolinecolor: "#334155",
    tickfont: { family: '"JetBrains Mono", monospace', size: 11, color: "#94a3b8" },
    automargin: true,
  },
  legend: {
    orientation: "h",
    yanchor: "bottom",
    y: 1.02,
    xanchor: "left",
    x: 0,
    font: { size: 11.5, color: "#cbd5e1" },
    bgcolor: "rgba(0,0,0,0)",
  },
  hoverlabel: {
    bgcolor: "#162033",
    bordercolor: "#334155",
    font: { family: '"JetBrains Mono", monospace', size: 12, color: "#f8fafc" },
  },
  hovermode: "x unified",
};

/**
 * Component bọc biểu đồ Plotly.js theo phong cách Fintech Dark Terminal:
 * - Đồng bộ bảng màu OLED, font số monospace và tooltip độ tương phản cao.
 * - Tự động nhận diện trục thời gian ISO để hiển thị ngày theo định dạng DD/MM/YYYY.
 * - Tự động co giãn qua ResizeObserver và dọn bộ nhớ khi unmount.
 */
export const PlotlyChart: React.FC<PlotlyChartProps> = ({ data, layout, height = 380 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const rawTitle = layout?.title;
    const mergedTitle =
      typeof rawTitle === "string"
        ? { ...(DARK_LAYOUT.title as object), text: rawTitle, font: DEFAULT_TITLE_FONT }
        : rawTitle
          ? {
              ...(DARK_LAYOUT.title as object),
              ...rawTitle,
              font: { ...DEFAULT_TITLE_FONT, ...(rawTitle.font ?? {}) },
            }
          : DARK_LAYOUT.title;

    const firstTraceX = Array.isArray(data[0]?.x) ? data[0]?.x[0] : undefined;
    const isDateAxis =
      typeof firstTraceX === "string" && /^\d{4}-\d{2}-\d{2}/.test(firstTraceX);

    const mergedLayout: Partial<Plotly.Layout> = {
      ...DARK_LAYOUT,
      ...layout,
      height,
      title: mergedTitle,
      xaxis: {
        ...DARK_LAYOUT.xaxis,
        ...(isDateAxis ? { hoverformat: "%d/%m/%Y", tickformat: "%d/%m/%Y" } : {}),
        ...(layout?.xaxis ?? {}),
      },
      yaxis: { ...DARK_LAYOUT.yaxis, ...(layout?.yaxis ?? {}) },
      margin: { ...DARK_LAYOUT.margin, ...(layout?.margin ?? {}) },
      legend: { ...DARK_LAYOUT.legend, ...(layout?.legend ?? {}) },
    };

    Plotly.react(el, data, mergedLayout, {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ["lasso2d", "select2d"],
    });

    const handleResize = () => {
      if (containerRef.current) Plotly.Plots.resize(containerRef.current);
    };

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(el);
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [data, layout, height]);

  useEffect(() => {
    const el = containerRef.current;
    return () => {
      if (el) Plotly.purge(el);
    };
  }, []);

  return (
    <div className="fintech-card w-full p-3 transition-colors hover:border-terminal-borderStrong/80">
      <div ref={containerRef} className="w-full" />
    </div>
  );
};
