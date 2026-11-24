import React from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { MetricTone } from "../utils/format";

export interface MetricDetail {
  label: string;
  value: string;
  tone?: MetricTone;
}

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  details?: MetricDetail[];
  tone?: MetricTone;
  trend?: "up" | "down" | "flat";
  featured?: boolean;
  alignRight?: boolean;
}

const VALUE_TONE_CLASS: Record<MetricTone, string> = {
  default: "text-terminal-text",
  positive: "text-pnl-gain",
  negative: "text-pnl-loss",
  warning: "text-pnl-warn",
  info: "text-terminal-accent",
};

const DETAIL_TONE_CLASS: Record<MetricTone, string> = {
  default: "text-terminal-secondary",
  positive: "text-pnl-gain",
  negative: "text-pnl-loss",
  warning: "text-pnl-warn",
  info: "text-terminal-accent",
};

const TREND_BADGE_CLASS: Record<"up" | "down" | "flat", string> = {
  up: "bg-pnl-gain/15 text-pnl-gain border-pnl-gain/25",
  down: "bg-pnl-loss/15 text-pnl-loss border-pnl-loss/25",
  flat: "bg-slate-800/80 text-terminal-muted border-terminal-borderStrong",
};

/**
 * Thẻ hiển thị chỉ số tài chính (KPI Card) chuẩn Fintech:
 * - Số liệu dùng font monospace + tabular-nums, căn phải để dễ đối chiếu trên mọi màn hình.
 * - Hỗ trợ chỉ báo hình học (mũi tên tăng/giảm) đi kèm màu sắc PnL để đảm bảo trợ năng (A11y).
 * - Hỗ trợ chế độ `featured` cho các Hero KPI trọng tâm và `details` dạng hàng khóa-giá trị.
 */
export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtext,
  details,
  tone = "default",
  trend,
  featured = false,
  alignRight = true,
}) => (
  <div
    className={`relative flex flex-col justify-between overflow-hidden rounded-xl border transition-colors ${
      featured
        ? "border-sky-500/25 bg-gradient-to-br from-terminal-card via-terminal-card to-terminal-elevated/80 px-5 py-4 shadow-hero"
        : "border-terminal-border bg-terminal-card px-4 py-3.5 shadow-card hover:border-terminal-borderStrong"
    }`}
  >
    {/* Dải nhấn phía trên dành cho Hero KPI */}
    {featured && (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-sky-400/70 to-transparent"
      />
    )}

    {/* Hàng nhãn & biểu tượng xu hướng */}
    <div className="flex items-center justify-between gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-terminal-muted">
        {label}
      </p>
      {trend && (
        <span
          aria-hidden="true"
          className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 ${TREND_BADGE_CLASS[trend]}`}
        >
          {trend === "up" && <TrendingUp className="h-3 w-3" />}
          {trend === "down" && <TrendingDown className="h-3 w-3" />}
          {trend === "flat" && <Minus className="h-3 w-3" />}
        </span>
      )}
    </div>

    {/* Giá trị tài chính chính */}
    <p
      className={`num-tabular mt-2 font-mono font-bold tracking-tight ${
        featured ? "text-2xl sm:text-[26px]" : "text-xl"
      } ${alignRight ? "text-right" : "text-left"} ${VALUE_TONE_CLASS[tone]}`}
    >
      {value}
    </p>

    {/* Hàng thông số phụ dạng cấu trúc (Key - Value) */}
    {details && details.length > 0 && (
      <div className="mt-3 space-y-1 border-t border-terminal-border/80 pt-2.5">
        {details.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-terminal-muted">{item.label}</span>
            <span
              className={`num-tabular text-right font-mono font-medium ${
                DETAIL_TONE_CLASS[item.tone ?? "default"]
              }`}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    )}

    {/* Chú thích đơn (nếu không dùng details) */}
    {!details && subtext && (
      <p
        className={`mt-2 border-t border-terminal-border/60 pt-2 text-xs text-terminal-muted ${
          alignRight ? "text-right" : "text-left"
        }`}
      >
        {subtext}
      </p>
    )}
  </div>
);
