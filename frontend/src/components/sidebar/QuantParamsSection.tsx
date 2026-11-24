import React, { useEffect, useState } from "react";
import { Play, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { AnalyzeRequest, OptimizationMethod } from "../../types/portfolio";

interface QuantParamsSectionProps {
  request: AnalyzeRequest;
  onUpdateRequest: (patch: Partial<AnalyzeRequest>) => void;
  onRun: (patch?: Partial<AnalyzeRequest>) => void;
  loading: boolean;
  isDirty: boolean;
}

function useNumericDraft(
  externalValue: number,
  options: { min: number; max: number; fallback: number; round?: boolean },
  onCommit: (val: number) => void
) {
  const [draft, setDraft] = useState(String(externalValue));

  useEffect(() => {
    setDraft(String(externalValue));
  }, [externalValue]);

  const commit = (): number => {
    const parsed = Number(draft);
    const valid = Number.isFinite(parsed) && draft.trim() !== "";
    const raw = valid ? (options.round ? Math.round(parsed) : parsed) : options.fallback;
    const clamped = Math.min(options.max, Math.max(options.min, raw));
    setDraft(String(clamped));
    if (clamped !== externalValue) {
      onCommit(clamped);
    }
    return clamped;
  };

  return { draft, setDraft, commit };
}

export const QuantParamsSection: React.FC<QuantParamsSectionProps> = ({
  request,
  onUpdateRequest,
  onRun,
  loading,
  isDirty,
}) => {
  const maxWeight = useNumericDraft(
    Math.round(request.max_weight * 100),
    { min: 10, max: 100, fallback: 50, round: true },
    (pct) => onUpdateRequest({ max_weight: pct / 100 })
  );

  const lookback = useNumericDraft(
    request.lookback_days,
    { min: 60, max: 756, fallback: 252, round: true },
    (days) => onUpdateRequest({ lookback_days: days })
  );

  const txCost = useNumericDraft(
    request.tx_cost_bps,
    { min: 0, max: 200, fallback: 0 },
    (bps) => onUpdateRequest({ tx_cost_bps: bps })
  );

  const slippage = useNumericDraft(
    request.slippage_bps,
    { min: 0, max: 200, fallback: 0 },
    (bps) => onUpdateRequest({ slippage_bps: bps })
  );

  const makeEnterHandler =
    (commitFn: () => number, toPatch: (val: number) => Partial<AnalyzeRequest>) =>
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const committed = commitFn();
        onRun(toPatch(committed));
      }
    };

  return (
    <section className="space-y-3.5 border-t border-terminal-border pt-5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-terminal-elevated text-terminal-secondary">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-terminal-secondary">
          Tham Số Định Lượng
        </h3>
      </div>

      <div>
        <label htmlFor="opt-method-select" className="block text-xs text-terminal-muted">
          Thuật toán tối ưu hóa
        </label>
        <select
          id="opt-method-select"
          value={request.optimization_method}
          onChange={(e) =>
            onUpdateRequest({ optimization_method: e.target.value as OptimizationMethod })
          }
          className="fintech-input cursor-pointer"
        >
          <option value="max_sharpe_lw">Tối đa Sharpe (Ledoit-Wolf Shrinkage)</option>
          <option value="hrp">Cân bằng rủi ro phân cấp (HRP)</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label
            htmlFor="max-weight-input"
            title="Tỷ trọng tối đa cho phép phân bổ vào 1 cổ phiếu (10% - 100%)"
            className="block text-xs text-terminal-muted"
          >
            Trần tỷ trọng (%)
          </label>
          <input
            id="max-weight-input"
            type="number"
            min={10}
            max={100}
            step={5}
            value={maxWeight.draft}
            onChange={(e) => maxWeight.setDraft(e.target.value)}
            onBlur={maxWeight.commit}
            onKeyDown={makeEnterHandler(maxWeight.commit, (pct) => ({ max_weight: pct / 100 }))}
            className="fintech-input num-tabular text-right font-mono"
          />
        </div>
        <div>
          <label
            htmlFor="lookback-input"
            title="Số phiên lịch sử dùng để ước lượng Walk-Forward (60 - 756 phiên)"
            className="block text-xs text-terminal-muted"
          >
            Cửa sổ Walk-Forward
          </label>
          <input
            id="lookback-input"
            type="number"
            min={60}
            max={756}
            step={21}
            value={lookback.draft}
            onChange={(e) => lookback.setDraft(e.target.value)}
            onBlur={lookback.commit}
            onKeyDown={makeEnterHandler(lookback.commit, (days) => ({ lookback_days: days }))}
            className="fintech-input num-tabular text-right font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label
            htmlFor="tx-cost-input"
            title="Phí môi giới và sở giao dịch tính theo điểm cơ bản (1 bps = 0.01%)"
            className="block text-xs text-terminal-muted"
          >
            Phí giao dịch (bps)
          </label>
          <input
            id="tx-cost-input"
            type="number"
            min={0}
            max={200}
            step={1}
            value={txCost.draft}
            onChange={(e) => txCost.setDraft(e.target.value)}
            onBlur={txCost.commit}
            onKeyDown={makeEnterHandler(txCost.commit, (bps) => ({ tx_cost_bps: bps }))}
            className="fintech-input num-tabular text-right font-mono"
          />
        </div>
        <div>
          <label
            htmlFor="slippage-input"
            title="Độ trượt giá khớp lệnh tính theo điểm cơ bản (1 bps = 0.01%)"
            className="block text-xs text-terminal-muted"
          >
            Trượt giá (bps)
          </label>
          <input
            id="slippage-input"
            type="number"
            min={0}
            max={200}
            step={1}
            value={slippage.draft}
            onChange={(e) => slippage.setDraft(e.target.value)}
            onBlur={slippage.commit}
            onKeyDown={makeEnterHandler(slippage.commit, (bps) => ({ slippage_bps: bps }))}
            className="fintech-input num-tabular text-right font-mono"
          />
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={() => onRun()}
          disabled={loading}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm shadow-sky-500/20 transition hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          {loading ? "Đang chạy mô hình..." : "Chạy Phân Tích Định Lượng"}
        </button>
        {isDirty && !loading && (
          <p className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-center text-[11px] font-medium text-amber-300">
            Tham số đã thay đổi — nhấn nút trên để cập nhật
          </p>
        )}
      </div>
    </section>
  );
};
