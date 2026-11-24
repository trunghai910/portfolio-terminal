import type { AnalyzeRequest, AnalyzeResponse, CacheStatus } from "../types/portfolio";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function analyzePortfolio(
  payload: AnalyzeRequest,
  signal?: AbortSignal
): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Yêu cầu thất bại với mã lỗi HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchCacheStatus(): Promise<CacheStatus> {
  const res = await fetch(`${API_BASE}/api/cache/status`);
  if (!res.ok) throw new Error("Không thể đọc trạng thái bộ nhớ đệm DuckDB");
  return res.json();
}

export async function clearDuckDBCache(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/cache/clear`, { method: "DELETE" });
  if (!res.ok) throw new Error("Không thể xóa bộ nhớ đệm DuckDB");
}
