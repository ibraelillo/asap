import type {
  BacktestRecord,
  BacktestDetailsPayload,
  KlineCacheReference,
  KlineCandle,
  BotStatsSummary,
  BotAnalysisSummary,
  BotRunRecord,
  DashboardPayload,
  TradeAnalysisPayload,
} from "../types/ranging-dashboard";

const API_URL = (
  import.meta.env.VITE_RANGING_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");
const KLINES_BASE_URL = (
  import.meta.env.VITE_RANGING_KLINES_BASE_URL || ""
).replace(/\/+$/, "");

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getKlineRefUrl(ref: KlineCacheReference): string | undefined {
  if (typeof ref.url === "string" && ref.url.length > 0) {
    return ref.url;
  }

  if (!KLINES_BASE_URL || !ref.key) return undefined;
  return `${KLINES_BASE_URL}/${encodePath(ref.key)}`;
}

function normalizeKlinesPayload(raw: unknown): KlineCandle[] {
  const rows = Array.isArray(raw)
    ? raw
    : (raw &&
      typeof raw === "object" &&
      Array.isArray((raw as { candles?: unknown[] }).candles))
      ? (raw as { candles: unknown[] }).candles
      : [];

  const byTime = new Map<number, KlineCandle>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const time = Number(value.time);
    const open = Number(value.open);
    const high = Number(value.high);
    const low = Number(value.low);
    const close = Number(value.close);
    const volume = Number(value.volume ?? 0);

    if (![time, open, high, low, close, volume].every(Number.isFinite)) {
      continue;
    }

    byTime.set(time, {
      time,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function fetchKlinesFromReference(
  ref: KlineCacheReference | undefined,
): Promise<KlineCandle[] | undefined> {
  if (!ref) return undefined;
  const url = getKlineRefUrl(ref);
  if (!url) return undefined;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as unknown;
    const candles = normalizeKlinesPayload(payload);
    if (candles.length === 0) return undefined;
    return candles;
  } catch {
    return undefined;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);

  if (!response.ok) {
    let details = "";
    try {
      const payload = (await response.json()) as {
        error?: unknown;
        details?: unknown;
      };
      const error =
        typeof payload.error === "string" ? payload.error : undefined;
      const reason =
        typeof payload.details === "string" ? payload.details : undefined;
      details = [error, reason].filter(Boolean).join(": ");
    } catch {
      // ignore parsing failures and keep default message
    }
    throw new Error(
      `API request failed (${response.status})${details ? `: ${details}` : ""}`,
    );
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let details = "";
    try {
      const payload = (await response.json()) as {
        error?: unknown;
        details?: unknown;
      };
      const error =
        typeof payload.error === "string" ? payload.error : undefined;
      const reason =
        typeof payload.details === "string" ? payload.details : undefined;
      details = [error, reason].filter(Boolean).join(": ");
    } catch {
      // ignore parsing failures and keep default message
    }
    throw new Error(
      `API request failed (${response.status})${details ? `: ${details}` : ""}`,
    );
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

export interface CreateBacktestRequest {
  symbol: string;
  periodDays?: number;
  fromMs?: number;
  toMs?: number;
  initialEquity?: number;
  executionTimeframe?: string;
  primaryRangeTimeframe?: string;
  secondaryRangeTimeframe?: string;
}

export async function fetchBacktests(limit = 50, symbol?: string): Promise<BacktestRecord[]> {
  const query = new URLSearchParams({
    limit: String(limit),
  });

  if (symbol) {
    query.set("symbol", symbol);
  }

  const payload = await getJson<{ backtests: BacktestRecord[] }>(
    `/v1/ranging/backtests?${query.toString()}`,
  );
  return payload.backtests;
}

export async function fetchBacktestDetails(
  backtestId: string,
  chartTimeframe?: string,
): Promise<BacktestDetailsPayload> {
  const encodedId = encodeURIComponent(backtestId);
  const query = new URLSearchParams();
  if (chartTimeframe) {
    query.set("chartTimeframe", chartTimeframe);
  }

  const suffix = query.toString();
  const details = await getJson<BacktestDetailsPayload>(
    `/v1/ranging/backtests/${encodedId}${suffix ? `?${suffix}` : ""}`,
  );
  if (details.candles.length > 0) {
    return details;
  }

  const cachedCandles = await fetchKlinesFromReference(details.candlesRef);
  if (!cachedCandles) {
    return details;
  }

  return {
    ...details,
    candles: cachedCandles,
  };
}

export async function createBacktest(
  request: CreateBacktestRequest,
): Promise<BacktestRecord> {
  const payload = await postJson<{ backtest: BacktestRecord }>(
    "/v1/ranging/backtests",
    request,
  );
  return payload.backtest;
}

export async function fetchBotStats(windowHours = 24): Promise<BotStatsSummary> {
  const query = new URLSearchParams({
    windowHours: String(windowHours),
  });

  return getJson<BotStatsSummary>(`/v1/ranging/bots/stats?${query.toString()}`);
}
