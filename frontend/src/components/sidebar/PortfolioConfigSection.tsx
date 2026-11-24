import React, { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import type { AnalyzeRequest, RebalanceFrequency } from "../../types/portfolio";

interface PortfolioConfigSectionProps {
  tickerInput: string;
  onTickerInputChange: (val: string) => void;
  request: AnalyzeRequest;
  onUpdateRequest: (patch: Partial<AnalyzeRequest>) => void;
  onKeyDownRun: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const PortfolioConfigSection: React.FC<PortfolioConfigSectionProps> = ({
  tickerInput,
  onTickerInputChange,
  request,
  onUpdateRequest,
  onKeyDownRun,
}) => {
  const [rfDraft, setRfDraft] = useState(
    request.risk_free_rate != null ? String((request.risk_free_rate * 100).toFixed(2)) : ""
  );

  useEffect(() => {
    setRfDraft(
      request.risk_free_rate != null ? String((request.risk_free_rate * 100).toFixed(2)) : ""
    );
  }, [request.risk_free_rate]);

  const commitRiskFreeRate = () => {
    const trimmed = rfDraft.trim();
    if (!trimmed) {
      onUpdateRequest({ risk_free_rate: null });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setRfDraft("");
      onUpdateRequest({ risk_free_rate: null });
      return;
    }
    const clampedPct = Math.min(25, Math.max(0, parsed));
    setRfDraft(clampedPct.toFixed(2));
    onUpdateRequest({ risk_free_rate: Number((clampedPct / 100).toFixed(4)) });
  };

  return (
    <section className="space-y-3.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-500/15 text-terminal-accent">
          <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-terminal-accent">
          Xây Dựng Danh Mục
        </h2>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="tickers-input" className="block text-xs font-medium text-terminal-secondary">
            Mã cổ phiếu (cách nhau bằng dấu phẩy)
          </label>
          <input
            id="tickers-input"
            type="text"
            value={tickerInput}
            onChange={(e) => onTickerInputChange(e.target.value)}
            onKeyDown={onKeyDownRun}
            placeholder="AAPL, MSFT, NVDA, JPM"
            className="fintech-input font-mono text-sm tracking-wide"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="start-date-input" className="block text-xs text-terminal-muted">
              Ngày bắt đầu
            </label>
            <input
              id="start-date-input"
              type="date"
              value={request.start_date}
              onChange={(e) => onUpdateRequest({ start_date: e.target.value })}
              className="fintech-input font-mono"
            />
          </div>
          <div>
            <label htmlFor="end-date-input" className="block text-xs text-terminal-muted">
              Ngày kết thúc
            </label>
            <input
              id="end-date-input"
              type="date"
              value={request.end_date ?? ""}
              onChange={(e) =>
                onUpdateRequest({ end_date: e.target.value ? e.target.value : null })
              }
              title="Để trống để lấy đến phiên giao dịch mới nhất"
              className="fintech-input font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="rebalance-select" className="block text-xs text-terminal-muted">
              Chu kỳ tái cân bằng
            </label>
            <select
              id="rebalance-select"
              value={request.rebalance_frequency}
              onChange={(e) =>
                onUpdateRequest({ rebalance_frequency: e.target.value as RebalanceFrequency })
              }
              className="fintech-input cursor-pointer"
            >
              <option value="M">Hàng tháng</option>
              <option value="Q">Hàng quý</option>
              <option value="Y">Hàng năm</option>
              <option value="NONE">Mua &amp; Nắm giữ</option>
            </select>
          </div>
          <div>
            <label htmlFor="rf-input" className="block text-xs text-terminal-muted">
              Lãi suất Rf (%/năm)
            </label>
            <input
              id="rf-input"
              type="number"
              min={0}
              max={25}
              step={0.1}
              placeholder="Tự động (^IRX)"
              value={rfDraft}
              onChange={(e) => setRfDraft(e.target.value)}
              onBlur={commitRiskFreeRate}
              onKeyDown={onKeyDownRun}
              className="fintech-input num-tabular text-right font-mono placeholder:text-left placeholder:font-sans"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
