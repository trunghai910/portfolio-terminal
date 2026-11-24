import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  Layers,
  Percent,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { analyzePortfolio, clearDuckDBCache, fetchCacheStatus } from "./api/client";
import { Sidebar } from "./components/Sidebar";
import { BacktestTab } from "./components/tabs/BacktestTab";
import { FactorsTab } from "./components/tabs/FactorsTab";
import { PortfolioTab } from "./components/tabs/PortfolioTab";
import { RiskTab } from "./components/tabs/RiskTab";
import { SignalsTab } from "./components/tabs/SignalsTab";
import { RF_SOURCE_LABELS } from "./constants/terminal";
import type { AnalyzeRequest, AnalyzeResponse, CacheStatus } from "./types/portfolio";
import { formatDateVN } from "./utils/format";
import {
  buildEqualWeights,
  parseTickerList,
  reconcileWeightsForTickers,
} from "./utils/weights";

type TabId = "portfolio" | "risk" | "signals" | "backtest" | "factors";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "portfolio", label: "Danh Mục", icon: <BarChart3 className="h-4 w-4" aria-hidden="true" /> },
  { id: "risk", label: "Rủi Ro", icon: <ShieldAlert className="h-4 w-4" aria-hidden="true" /> },
  { id: "signals", label: "Tín Hiệu", icon: <Activity className="h-4 w-4" aria-hidden="true" /> },
  { id: "backtest", label: "Kiểm Thử", icon: <TrendingUp className="h-4 w-4" aria-hidden="true" /> },
  { id: "factors", label: "Nhân Tố", icon: <Layers className="h-4 w-4" aria-hidden="true" /> },
];

const DEFAULT_TICKER_INPUT = "AAPL, MSFT, NVDA, JPM";
const DEFAULT_REQUEST: AnalyzeRequest = {
  tickers: ["AAPL", "MSFT", "NVDA", "JPM"],
  weights: { AAPL: 0.25, MSFT: 0.25, NVDA: 0.25, JPM: 0.25 },
  start_date: "2023-01-01",
  end_date: null,
  risk_free_rate: null,
  optimization_method: "max_sharpe_lw",
  max_weight: 0.5,
  rebalance_frequency: "M",
  tx_cost_bps: 5,
  slippage_bps: 5,
  lookback_days: 252,
};

/**
 * Khung ứng dụng chính (Root Shell):
 * - Quản lý luồng gọi API, hủy request chồng chéo (AbortController) và trạng thái phân hệ.
 * - Bố cục 2 vùng cố định trên desktop (Sidebar trái + Workspace cuộn độc lập bên phải).
 */
export default function App() {
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKER_INPUT);
  const [activeTab, setActiveTab] = useState<TabId>("portfolio");
  const [request, setRequest] = useState<AnalyzeRequest>(DEFAULT_REQUEST);

  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);

  const parsedTickers = useMemo(() => parseTickerList(tickerInput), [tickerInput]);

  const refreshCacheStatus = useCallback(async () => {
    try {
      const status = await fetchCacheStatus();
      setCacheStatus(status);
    } catch {
      // bỏ qua nếu máy chủ backend chưa khởi chạy
    }
  }, []);

  const executeAnalysis = useCallback(
    async (payload: AnalyzeRequest) => {
      if (payload.tickers.length === 0) {
        setError("Vui lòng nhập ít nhất một mã cổ phiếu hợp lệ.");
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const res = await analyzePortfolio(payload, controller.signal);
        setData(res);
        setIsDirty(false);
        void refreshCacheStatus();
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        setError(
          (err as Error).message || "Đã xảy ra lỗi không mong muốn khi chạy mô hình định lượng."
        );
      } finally {
        setLoading(false);
      }
    },
    [refreshCacheStatus]
  );

  const runAnalysis = useCallback(
    (patch?: Partial<AnalyzeRequest>) => {
      const nextRequest = patch ? { ...request, ...patch } : request;
      if (patch) {
        setRequest(nextRequest);
      }
      return executeAnalysis({
        ...nextRequest,
        tickers: patch?.tickers ?? parsedTickers,
      });
    },
    [executeAnalysis, parsedTickers, request]
  );

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      void executeAnalysis(DEFAULT_REQUEST);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [executeAnalysis]);

  const handleTickerInputChange = (val: string) => {
    setTickerInput(val);
    setIsDirty(true);
    const nextTickers = parseTickerList(val);
    setRequest((prev) => ({
      ...prev,
      tickers: nextTickers,
      weights: reconcileWeightsForTickers(nextTickers, prev.weights),
    }));
  };

  const handleEqualizeWeights = () => {
    if (parsedTickers.length === 0) return;
    setIsDirty(true);
    setRequest((prev) => ({ ...prev, weights: buildEqualWeights(parsedTickers) }));
  };

  const handleClearCache = async () => {
    try {
      await clearDuckDBCache();
      await refreshCacheStatus();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-terminal-canvas text-terminal-text lg:h-screen lg:flex-row lg:overflow-hidden">
      <Sidebar
        tickerInput={tickerInput}
        onTickerInputChange={handleTickerInputChange}
        parsedTickers={parsedTickers}
        request={request}
        onUpdateRequest={(patch) => {
          setIsDirty(true);
          setRequest((prev) => ({ ...prev, ...patch }));
        }}
        onWeightsChange={(nextWeights) => {
          setIsDirty(true);
          setRequest((prev) => ({ ...prev, weights: nextWeights }));
        }}
        onEqualizeWeights={handleEqualizeWeights}
        onRun={(patch) => void runAnalysis(patch)}
        loading={loading}
        isDirty={isDirty}
        cacheStatus={cacheStatus}
        onClearCache={handleClearCache}
      />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:h-screen lg:p-7">
        {/* Thanh tiêu đề & Điều hướng Tab */}
        <header className="mb-6 flex flex-col gap-4 border-b border-terminal-border pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-terminal-text sm:text-2xl">
                Hệ Thống Quản Lý Danh Mục Định Lượng
              </h1>
              <span className="rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-terminal-accent">
                Quant Terminal v2.0
              </span>
            </div>

            {data && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-terminal-border bg-terminal-card px-2.5 py-1 text-terminal-secondary">
                  <Calendar className="h-3.5 w-3.5 text-terminal-muted" aria-hidden="true" />
                  <span className="num-tabular font-mono text-terminal-text">
                    {formatDateVN(data.meta.effective_start_date)}
                  </span>
                  <span className="text-terminal-muted">&rarr;</span>
                  <span className="num-tabular font-mono text-terminal-text">
                    {formatDateVN(data.meta.end_date)}
                  </span>
                  <span className="text-terminal-muted">({data.meta.trading_days} phiên)</span>
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-md border border-terminal-border bg-terminal-card px-2.5 py-1 text-terminal-secondary">
                  <Percent className="h-3.5 w-3.5 text-pnl-gain" aria-hidden="true" />
                  <span className="text-terminal-muted">Rf:</span>
                  <span className="num-tabular font-mono font-semibold text-pnl-gain">
                    {(data.meta.risk_free_rate * 100).toFixed(2)}%/năm
                  </span>
                  <span className="hidden text-terminal-muted sm:inline">
                    &bull; {RF_SOURCE_LABELS[data.meta.risk_free_source]}
                    {data.meta.risk_free_source === "^IRX"
                      ? ` (cuối kỳ ${(data.meta.risk_free_latest * 100).toFixed(2)}%)`
                      : ""}
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Thanh chuyển đổi 5 phân hệ */}
          <nav
            role="tablist"
            aria-label="Các phân hệ phân tích danh mục"
            className="flex gap-1 overflow-x-auto rounded-xl border border-terminal-border bg-terminal-card p-1 shadow-card"
          >
            {TABS.map((t) => {
              const selected = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`tabpanel-${t.id}`}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                    selected
                      ? "bg-sky-500 text-slate-950 shadow-sm shadow-sky-500/20"
                      : "text-terminal-muted hover:bg-terminal-elevated hover:text-terminal-text"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
          </nav>
        </header>

        {/* Thanh cảnh báo dữ liệu (Mã không hợp lệ / Lệch ngày IPO) */}
        {data && data.meta.warnings.length > 0 && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pnl-warn" aria-hidden="true" />
              <ul className="space-y-1">
                {data.meta.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Thanh thông báo lỗi */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pnl-loss/40 bg-pnl-loss/10 p-3.5 text-xs text-rose-200"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void runAnalysis()}
              className="shrink-0 cursor-pointer rounded-lg border border-rose-400/40 bg-pnl-loss/20 px-3 py-1.5 font-semibold text-rose-100 transition hover:bg-pnl-loss/30"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Trạng thái tải dữ liệu lần đầu */}
        {!data && loading && (
          <div className="fintech-card flex h-72 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-terminal-secondary">
            <RefreshCw className="h-6 w-6 animate-spin text-terminal-accent" aria-hidden="true" />
            <p>Đang tải dữ liệu thị trường qua DuckDB và chạy động cơ kiểm thử Walk-Forward...</p>
          </div>
        )}

        {/* Trạng thái trống khi chưa có dữ liệu */}
        {!data && !loading && (
          <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-terminal-borderStrong bg-terminal-card/50 p-6 text-center">
            <p className="max-w-md text-sm text-terminal-muted">
              Chưa có dữ liệu phân tích. Hãy kiểm tra kết nối máy chủ hoặc điều chỉnh danh mục ở
              thanh bên trái rồi chạy lại.
            </p>
            <button
              type="button"
              onClick={() => void runAnalysis()}
              className="cursor-pointer rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              Chạy Phân Tích Ngay
            </button>
          </div>
        )}

        {/* Nội dung Tab đang chọn */}
        {data && (
          <div
            id={`tabpanel-${activeTab}`}
            role="tabpanel"
            className={`relative transition-opacity duration-200 ${
              loading ? "pointer-events-none opacity-55" : "opacity-100"
            }`}
          >
            {loading && (
              <div className="sticky top-3 z-20 mb-4 flex justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-terminal-elevated/95 px-4 py-1.5 text-xs font-medium text-terminal-accent shadow-lg backdrop-blur">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Đang cập nhật mô hình định lượng...
                </div>
              </div>
            )}

            {activeTab === "portfolio" && <PortfolioTab data={data} />}
            {activeTab === "risk" && <RiskTab data={data} />}
            {activeTab === "signals" && <SignalsTab data={data} />}
            {activeTab === "backtest" && <BacktestTab data={data} />}
            {activeTab === "factors" && <FactorsTab data={data} />}
          </div>
        )}
      </main>
    </div>
  );
}
