import React from "react";
import type { AnalyzeRequest, CacheStatus } from "../types/portfolio";
import { CacheStatusCard } from "./sidebar/CacheStatusCard";
import { PortfolioConfigSection } from "./sidebar/PortfolioConfigSection";
import { QuantParamsSection } from "./sidebar/QuantParamsSection";
import { WeightAllocatorSection } from "./sidebar/WeightAllocatorSection";

interface SidebarProps {
  tickerInput: string;
  onTickerInputChange: (val: string) => void;
  parsedTickers: string[];
  request: AnalyzeRequest;
  onUpdateRequest: (patch: Partial<AnalyzeRequest>) => void;
  onWeightsChange: (nextWeights: Record<string, number>) => void;
  onEqualizeWeights: () => void;
  onRun: (patch?: Partial<AnalyzeRequest>) => void;
  loading: boolean;
  isDirty: boolean;
  cacheStatus: CacheStatus | null;
  onClearCache: () => Promise<void> | void;
}

/**
 * Thanh điều khiển bên trái (Control Panel) hợp thành từ 4 phân khu độc lập:
 * - PortfolioConfigSection: Danh sách mã, khung thời gian, chu kỳ tái cân bằng & lãi suất Rf.
 * - WeightAllocatorSection: Phân bổ tỷ trọng mục tiêu có khóa từng mã & tự động cân bằng.
 * - QuantParamsSection: Tham số thuật toán tối ưu, Walk-Forward, phí giao dịch & trượt giá.
 * - CacheStatusCard: Giám sát và xóa bộ nhớ đệm DuckDB.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  tickerInput,
  onTickerInputChange,
  parsedTickers,
  request,
  onUpdateRequest,
  onWeightsChange,
  onEqualizeWeights,
  onRun,
  loading,
  isDirty,
  cacheStatus,
  onClearCache,
}) => {
  const handleKeyDownRun = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onRun();
    }
  };

  return (
    <aside
      aria-label="Bảng cấu hình danh mục và tham số định lượng"
      className="flex w-full flex-col gap-6 border-b border-terminal-border bg-terminal-sidebar p-5 lg:h-screen lg:w-[340px] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r"
    >
      <PortfolioConfigSection
        tickerInput={tickerInput}
        onTickerInputChange={onTickerInputChange}
        request={request}
        onUpdateRequest={onUpdateRequest}
        onRun={onRun}
        onKeyDownRun={handleKeyDownRun}
      />

      <WeightAllocatorSection
        parsedTickers={parsedTickers}
        weights={request.weights}
        onWeightsChange={onWeightsChange}
        onEqualizeWeights={onEqualizeWeights}
        onRun={onRun}
      />

      <QuantParamsSection
        request={request}
        onUpdateRequest={onUpdateRequest}
        onRun={onRun}
        loading={loading}
        isDirty={isDirty}
      />

      <CacheStatusCard cacheStatus={cacheStatus} onClearCache={onClearCache} />
    </aside>
  );
};
