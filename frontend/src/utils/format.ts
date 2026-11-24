/**
 * Bộ hàm định dạng dữ liệu tài chính & thời gian theo chuẩn Fintech Việt Nam / Quốc tế.
 */

export function formatDateVN(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatSignedPct(value: number, decimals = 2): string {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) {
    return `${(0).toFixed(decimals)}%`;
  }
  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}

export function formatCurrencyUSD(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export type MetricTone = "default" | "positive" | "negative" | "warning" | "info";

export function getPnLTone(value: number): MetricTone {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return "default";
  return value > 0 ? "positive" : "negative";
}

export function getPnLTrend(value: number): "up" | "down" | "flat" {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return "flat";
  return value > 0 ? "up" : "down";
}
