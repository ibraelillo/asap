import type {
  BotAnalysisSummary,
  BotRunRecord,
  DashboardPayload,
  TradeAnalysisPayload,
} from "../types/ranging-dashboard";

const API_URL = (
  import.meta.env.VITE_RANGING_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);

  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export function getApiUrl(): string {
  return API_URL;
}

export async function fetchDashboard(limit = 200): Promise<DashboardPayload> {
  const query = new URLSearchParams({
    limit: String(limit),
  });

  return getJson<DashboardPayload>(`/v1/ranging/dashboard?${query.toString()}`);
}

export async function fetchRuns(limit = 200, symbol?: string): Promise<BotRunRecord[]> {
  const query = new URLSearchParams({
    limit: String(limit),
  });

  if (symbol) {
    query.set("symbol", symbol);
  }

  const payload = await getJson<{ runs: BotRunRecord[] }>(`/v1/ranging/runs?${query.toString()}`);
  return payload.runs;
}

export async function fetchBots(symbols?: string[]): Promise<BotAnalysisSummary[]> {
  const query = new URLSearchParams();
  if (symbols && symbols.length > 0) {
    query.set("symbols", symbols.join(","));
  }

  const suffix = query.toString();
  const payload = await getJson<{ bots: BotAnalysisSummary[] }>(
    `/v1/ranging/bots${suffix ? `?${suffix}` : ""}`,
  );
  return payload.bots;
}

export async function fetchTradeAnalysis(
  tradeId: string,
  options?: {
    barsBefore?: number;
    barsAfter?: number;
    timeframe?: string;
  },
): Promise<TradeAnalysisPayload> {
  const query = new URLSearchParams();

  if (options?.barsBefore) {
    query.set("barsBefore", String(options.barsBefore));
  }

  if (options?.barsAfter) {
    query.set("barsAfter", String(options.barsAfter));
  }

  if (options?.timeframe) {
    query.set("timeframe", options.timeframe);
  }

  const encodedId = encodeURIComponent(tradeId);
  const suffix = query.toString();

  return getJson<TradeAnalysisPayload>(
    `/v1/ranging/trades/${encodedId}${suffix ? `?${suffix}` : ""}`,
  );
}
