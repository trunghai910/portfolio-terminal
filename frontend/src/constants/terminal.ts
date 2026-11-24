import type {
  OptimizationMethod,
  RegimeState,
  RiskFreeSource,
  SignalAction,
} from "../types/portfolio";

export const REGIME_LABELS: Record<RegimeState, string> = {
  BULL: "TĂNG (BULL)",
  NEUTRAL: "TRUNG TÍNH",
  BEAR: "GIẢM (BEAR)",
};

export const REGIME_COLORS: Record<RegimeState, string> = {
  BULL: "#22c55e",
  NEUTRAL: "#f59e0b",
  BEAR: "#ef4444",
};

export const OPT_METHOD_LABELS: Record<OptimizationMethod, string> = {
  max_sharpe_lw: "Max Sharpe Ledoit-Wolf",
  hrp: "HRP (Phân cấp rủi ro)",
};

export const SIGNAL_LABELS: Record<SignalAction, string> = {
  BUY: "MUA (BUY)",
  SELL: "BÁN (SELL)",
  HOLD: "GIỮ (HOLD)",
};

export const RF_SOURCE_LABELS: Record<RiskFreeSource, string> = {
  "^IRX": "Tín phiếu Kho bạc Mỹ 13 tuần (^IRX)",
  user_override: "Tùy chỉnh người dùng",
  default: "Mặc định hệ thống",
};

export const FACTOR_VI_LABELS: Record<string, string> = {
  MKT: "Phần bù rủi ro thị trường (SPY - Rf)",
  TECH_SPREAD: "Chênh lệch Công nghệ / Tăng trưởng (QQQ - SPY)",
  SIZE_SPREAD: "Chênh lệch quy mô vốn hóa nhỏ (IWM - SPY)",
  VOL_SHOCK: "Cú sốc biến động (^VIX %Δ)",
};

export const CHART_COLORS = {
  accent: "#38bdf8",
  gain: "#22c55e",
  loss: "#ef4444",
  warn: "#f59e0b",
  purple: "#a78bfa",
  benchmark: "#94a3b8",
  mutedLine: "#64748b",
  zeroLine: "#475569",
  cardBg: "#0e1525",
  canvasBg: "#020617",
  textPrimary: "#f8fafc",
  textSecondary: "#cbd5e1",
  pieCurrent: ["#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#fb7185", "#2dd4bf"],
  pieOptimized: ["#22c55e", "#38bdf8", "#f59e0b", "#a78bfa", "#fb7185", "#2dd4bf"],
} as const;
