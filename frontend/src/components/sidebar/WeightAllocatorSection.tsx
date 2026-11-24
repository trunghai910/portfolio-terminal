import React, { useEffect, useState } from "react";
import { Equal, Lock, Unlock } from "lucide-react";
import { getWeightPercent, rebalanceLockedPercentages } from "../../utils/weights";

interface WeightAllocatorSectionProps {
  parsedTickers: string[];
  weights: Record<string, number>;
  onWeightsChange: (nextWeights: Record<string, number>) => void;
  onEqualizeWeights: () => void;
  onKeyDownRun: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const WeightAllocatorSection: React.FC<WeightAllocatorSectionProps> = ({
  parsedTickers,
  weights,
  onWeightsChange,
  onEqualizeWeights,
  onKeyDownRun,
}) => {
  const [lockedTickers, setLockedTickers] = useState<Record<string, boolean>>({});
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<string>("");

  const totalPct = Number(
    parsedTickers.reduce((acc, t) => acc + getWeightPercent(weights, t), 0).toFixed(1)
  );

  useEffect(() => {
    setLockedTickers((prev) => {
      const next: Record<string, boolean> = {};
      parsedTickers.forEach((t) => {
        if (prev[t]) next[t] = true;
      });
      return next;
    });
  }, [parsedTickers]);

  const applyPercentageChange = (targetTicker: string, desiredPct: number) => {
    const nextWeights = rebalanceLockedPercentages(
      parsedTickers,
      weights,
      lockedTickers,
      targetTicker,
      desiredPct
    );
    onWeightsChange(nextWeights);
  };

  const toggleLockTicker = (ticker: string) => {
    setLockedTickers((prev) => ({ ...prev, [ticker]: !prev[ticker] }));
  };

  const handleEqualizeAndUnlock = () => {
    setLockedTickers({});
    setEditingTicker(null);
    onEqualizeWeights();
  };

  return (
    <section className="space-y-3 border-t border-terminal-border pt-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-terminal-secondary">
          Tỷ Trọng Mục Tiêu
        </h3>
        {parsedTickers.length > 1 && (
          <button
            type="button"
            onClick={handleEqualizeAndUnlock}
            title="Mở khóa tất cả và chia đều tỷ trọng"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-terminal-borderStrong bg-terminal-elevated px-2.5 py-1 text-[11px] font-medium text-terminal-secondary transition hover:border-sky-500/50 hover:text-terminal-accent"
          >
            <Equal className="h-3 w-3" aria-hidden="true" />
            Chia đều
          </button>
        )}
      </div>

      {/* Thanh tổng phân bổ tỷ trọng */}
      <div className="rounded-lg border border-terminal-border bg-terminal-card/70 px-3 py-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-terminal-muted">Tổng phân bổ</span>
          <span
            className={`num-tabular font-mono font-semibold ${
              Math.abs(totalPct - 100) <= 0.2
                ? "text-pnl-gain"
                : totalPct > 100
                  ? "text-pnl-loss"
                  : "text-pnl-warn"
            }`}
          >
            {totalPct.toFixed(1)}% / 100%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-terminal-elevated">
          <div
            className={`h-full rounded-full transition-all duration-150 ${
              Math.abs(totalPct - 100) <= 0.2
                ? "bg-pnl-gain"
                : totalPct > 100
                  ? "bg-pnl-loss"
                  : "bg-pnl-warn"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, totalPct))}%` }}
          />
        </div>
      </div>

      <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
        {parsedTickers.map((t) => {
          const pct = getWeightPercent(weights, t);
          const isLocked = Boolean(lockedTickers[t]);
          const lockedOthersSum = parsedTickers.reduce(
            (acc, other) =>
              other !== t && lockedTickers[other] ? acc + getWeightPercent(weights, other) : acc,
            0
          );
          const maxAllowedPct = Math.max(0, Number((100 - lockedOthersSum).toFixed(1)));
          const inputValue = editingTicker === t ? editingDraft : String(pct);

          return (
            <div
              key={t}
              className={`rounded-lg border p-2.5 transition-colors ${
                isLocked
                  ? "border-amber-500/35 bg-amber-500/[0.04]"
                  : "border-terminal-border/80 bg-terminal-card/90"
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleLockTicker(t)}
                    title={
                      isLocked
                        ? `Mở khóa tỷ trọng ${t}`
                        : `Khóa cố định tỷ trọng ${t} khi chỉnh các mã khác`
                    }
                    aria-label={isLocked ? `Mở khóa tỷ trọng ${t}` : `Khóa tỷ trọng ${t}`}
                    aria-pressed={isLocked}
                    className={`cursor-pointer rounded p-1 transition ${
                      isLocked
                        ? "bg-amber-500/20 text-pnl-warn hover:bg-amber-500/30"
                        : "text-terminal-muted hover:bg-terminal-elevated hover:text-terminal-text"
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                  <label htmlFor={`weight-num-${t}`} className="font-mono font-semibold text-terminal-text">
                    {t}
                  </label>
                </div>

                <div className="flex items-center gap-1.5">
                  {!isLocked && maxAllowedPct < 100 && (
                    <span
                      title={`Trần tối đa có thể nhập (do các mã khác đang khóa ${lockedOthersSum.toFixed(1)}%)`}
                      className="num-tabular font-mono text-[10px] text-terminal-muted"
                    >
                      tối đa {maxAllowedPct.toFixed(0)}%
                    </span>
                  )}
                  <div className="relative flex items-center">
                    <input
                      id={`weight-num-${t}`}
                      type="number"
                      min={0}
                      max={maxAllowedPct}
                      step={0.5}
                      disabled={isLocked}
                      aria-label={`Tỷ trọng phần trăm của ${t}`}
                      value={inputValue}
                      onFocus={() => {
                        setEditingTicker(t);
                        setEditingDraft(String(pct));
                      }}
                      onChange={(e) => {
                        const rawStr = e.target.value;
                        setEditingDraft(rawStr);
                        if (rawStr.trim() === "") return;
                        const parsed = Number(rawStr);
                        if (Number.isFinite(parsed)) {
                          const clamped = Math.min(maxAllowedPct, Math.max(0, parsed));
                          applyPercentageChange(t, clamped);
                        }
                      }}
                      onBlur={() => {
                        const parsed = Number(editingDraft);
                        const finalVal =
                          editingDraft.trim() !== "" && Number.isFinite(parsed)
                            ? Math.min(maxAllowedPct, Math.max(0, parsed))
                            : 0;
                        applyPercentageChange(t, finalVal);
                        setEditingTicker(null);
                      }}
                      onKeyDown={onKeyDownRun}
                      className="num-tabular w-[76px] rounded-md border border-terminal-borderStrong bg-terminal-elevated py-1 pl-2 pr-5 text-right font-mono text-xs text-terminal-text focus:border-terminal-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-2 font-mono text-[11px] text-terminal-muted"
                    >
                      %
                    </span>
                  </div>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                disabled={isLocked}
                aria-label={`Thanh trượt tỷ trọng phần trăm của ${t}`}
                value={pct}
                onChange={(e) => {
                  const nextVal = Math.min(maxAllowedPct, parseFloat(e.target.value));
                  applyPercentageChange(t, nextVal);
                }}
                className="mt-2 h-1.5 w-full cursor-pointer accent-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
