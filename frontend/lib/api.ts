import type { BacktestResult, Bar, SavedBacktest, Signal } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(typeof FormData !== "undefined" && init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  bars: (symbol: string, limit = 300) =>
    request<{ symbol: string; total: number; bars: Bar[] }>(`/data/${symbol}?limit=${limit}`),
  signals: (symbol?: string) =>
    request<{ signals: Signal[] }>(`/signals/latest${symbol ? `?symbol=${symbol}` : ""}`),
  signalHistory: (symbol?: string) =>
    request<{ signals: Signal[] }>(`/signals/history?limit=100${symbol ? `&symbol=${symbol}` : ""}`),
  health: () => request<{ status: string; database: string; service: string; timestamp: string }>("/health"),
  metrics: (symbol: string) => request<any>(`/model/metrics?symbol=${symbol}`),
  explain: (symbol: string) => request<{ features: { feature: string; importance: number }[] }>(`/model/explain?symbol=${symbol}`),
  runBacktest: (params: Record<string, unknown>) =>
    request<BacktestResult>("/backtest/run", { method: "POST", body: JSON.stringify(params) }),
  backtests: () => request<{ runs: SavedBacktest[] }>("/backtest?limit=20"),
  backtest: (runId: string) => request<BacktestResult>(`/backtest/${runId}`),
  upload: (symbol: string, file: File) => {
    const body = new FormData();
    body.append("symbol", symbol);
    body.append("file", file);
    return request<{ symbol: string; bars: number; source: string }>("/data/fetch", { method: "POST", body });
  },
  train: (symbol: string) =>
    request<{ job_id: string; websocket: string }>("/model/train", { method: "POST", body: JSON.stringify({ symbol }) }),
};

export function socketUrl(path: string) {
  return `${API_URL.replace(/^http/, "ws")}${path}`;
}
