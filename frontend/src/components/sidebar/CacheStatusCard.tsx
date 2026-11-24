import React, { useState } from "react";
import { Database, Trash2 } from "lucide-react";
import type { CacheStatus } from "../../types/portfolio";

interface CacheStatusCardProps {
  cacheStatus: CacheStatus | null;
  onClearCache: () => Promise<void> | void;
}

export const CacheStatusCard: React.FC<CacheStatusCardProps> = ({
  cacheStatus,
  onClearCache,
}) => {
  const [confirmClearCache, setConfirmClearCache] = useState(false);

  return (
    <section className="mt-auto rounded-xl border border-terminal-border bg-terminal-card/90 p-3.5 text-xs">
      <div className="flex items-center justify-between text-terminal-secondary">
        <span className="flex items-center gap-1.5 font-medium">
          <Database className="h-3.5 w-3.5 text-pnl-gain" aria-hidden="true" />
          Bộ Nhớ Đệm DuckDB
        </span>
        {!confirmClearCache ? (
          <button
            type="button"
            onClick={() => setConfirmClearCache(true)}
            title="Xóa bộ nhớ đệm DuckDB"
            aria-label="Xóa bộ nhớ đệm DuckDB"
            className="cursor-pointer rounded-md p-1 text-terminal-muted transition hover:bg-terminal-elevated hover:text-pnl-loss"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={async () => {
                setConfirmClearCache(false);
                await onClearCache();
              }}
              className="cursor-pointer rounded bg-pnl-loss/20 px-2 py-0.5 text-[11px] font-semibold text-rose-300 transition hover:bg-pnl-loss/30"
            >
              Xóa
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearCache(false)}
              className="cursor-pointer rounded bg-terminal-elevated px-2 py-0.5 text-[11px] text-terminal-muted transition hover:text-terminal-text"
            >
              Hủy
            </button>
          </div>
        )}
      </div>
      {cacheStatus ? (
        <div className="mt-2 flex items-center justify-between text-[11px] text-terminal-muted">
          <span>Đã lưu {cacheStatus.total_tickers} mã</span>
          <span className="num-tabular font-mono text-terminal-secondary">
            {cacheStatus.size_kb.toFixed(1)} KB
          </span>
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-terminal-muted">Đang kết nối máy chủ...</p>
      )}
    </section>
  );
};
