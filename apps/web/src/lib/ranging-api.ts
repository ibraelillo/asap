import type {
  BacktestRecord,
  BotPositionsPayload,
  BacktestDetailsPayload,
  KlineCacheReference,
  KlineCandle,
  BotStatsSummary,
  BotAnalysisSummary,
  BotRunRecord,
  DashboardPayload,
  AccountSummary,
  StrategyDetailsPayload,
  StrategySummary,
  RangeValidationRecord,
  TradeAnalysisPayload,
  BotRecordView,
  PositionRecord,
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
    : raw &&
        typeof raw === "object" &&
        Array.isArray((raw as { candles?: unknown[] }).candles)
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

    byTime.set(time, { time, open, high, low, close, volume });
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
  const query = new URLSearchParams({ limit: String(limit) });
  return getJson<DashboardPayload>(`/v1/ranging/dashboard?${query.toString()}`);
}

export async function fetchRuns(
  limit = 200,
  botId?: string,
): Promise<BotRunRecord[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (botId) query.set("botId", botId);
  const payload = await getJson<{ runs: BotRunRecord[] }>(
    `/v1/ranging/runs?${query.toString()}`,
  );
  return payload.runs;
}

export async function fetchBots(
  botIds?: string[],
): Promise<BotAnalysisSummary[]> {
  const query = new URLSearchParams();
  if (botIds && botIds.length > 0) {
    query.set("botIds", botIds.join(","));
  }

  const suffix = query.toString();
  const payload = await getJson<{ bots: BotAnalysisSummary[] }>(
    `/v1/bots${suffix ? `?${suffix}` : ""}`,
  );
  return payload.bots;
}

export async function createBot(
  request: CreateBotRequest,
): Promise<BotRecordView> {
  const payload = await postJson<{
    generatedAt: string;
    bot: BotRecordView;
  }>("/v1/bots", request);
  return payload.bot;
}

export interface CreateAccountRequest {
  name: string;
  exchangeId: string;
  auth: {
    apiKey: string;
    apiSecret: string;
    apiPassphrase?: string;
  };
}

export async function fetchAccounts(
  exchangeId?: string,
  options?: { includeBalance?: boolean },
): Promise<AccountSummary[]> {
  const query = new URLSearchParams();
  if (exchangeId) query.set("exchangeId", exchangeId);
  if (options?.includeBalance) query.set("includeBalance", "true");
  const suffix = query.toString();
  const payload = await getJson<{ accounts: AccountSummary[] }>(
    `/v1/accounts${suffix ? `?${suffix}` : ""}`,
  );
  return payload.accounts;
}

export async function createAccount(
  request: CreateAccountRequest,
): Promise<AccountSummary> {
  const payload = await postJson<{
    generatedAt: string;
    account: AccountSummary;
  }>("/v1/accounts", request);
  return payload.account;
}

export interface PatchAccountRequest {
  status?: "active" | "archived";
  auth?: {
    apiKey?: string;
    apiSecret?: string;
    apiPassphrase?: string;
  };
}

export async function patchAccount(
  accountId: string,
  request: PatchAccountRequest,
): Promise<AccountSummary> {
  const payload = await fetch(
    `${API_URL}/v1/accounts/${encodeURIComponent(accountId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  if (!payload.ok) {
    let details = "";
    try {
      const body = (await payload.json()) as {
        error?: unknown;
        details?: unknown;
      };
      const error = typeof body.error === "string" ? body.error : undefined;
      const reason =
        typeof body.details === "string" ? body.details : undefined;
      details = [error, reason].filter(Boolean).join(": ");
    } catch {
      // ignore
    }
    throw new Error(
      `API request failed (${payload.status})${details ? `: ${details}` : ""}`,
    );
  }

  const result = (await payload.json()) as {
    generatedAt: string;
    account: AccountSummary;
  };
  return result.account;
}

export async function fetchStrategies(
  windowHours = 24,
): Promise<StrategySummary[]> {
  const query = new URLSearchParams({ windowHours: String(windowHours) });
  const payload = await getJson<{ strategies: StrategySummary[] }>(
    `/v1/strategies?${query.toString()}`,
  );
  return payload.strategies;
}

export async function fetchStrategyDetails(
  strategyId: string,
  windowHours = 24,
): Promise<StrategyDetailsPayload> {
  const query = new URLSearchParams({ windowHours: String(windowHours) });
  return getJson<StrategyDetailsPayload>(
    `/v1/strategies/${encodeURIComponent(strategyId)}?${query.toString()}`,
  );
}

export async function fetchBotDetails(botId: string): Promise<{
  bot: BotRecordView;
  summary?: BotAnalysisSummary;
  openPosition?: PositionRecord | null;
  backtests: BacktestRecord[];
  validations: RangeValidationRecord[];
}> {
  return getJson(`/v1/bots/${encodeURIComponent(botId)}`);
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

  if (options?.barsBefore) query.set("barsBefore", String(options.barsBefore));
  if (options?.barsAfter) query.set("barsAfter", String(options.barsAfter));
  if (options?.timeframe) query.set("timeframe", options.timeframe);

  const encodedId = encodeURIComponent(tradeId);
  const suffix = query.toString();

  return getJson<TradeAnalysisPayload>(
    `/v1/ranging/trades/${encodedId}${suffix ? `?${suffix}` : ""}`,
  );
}

export interface CreateBacktestRequest {
  symbol?: string;
  periodDays?: number;
  fromMs?: number;
  toMs?: number;
  initialEquity?: number;
  executionTimeframe?: string;
  primaryRangeTimeframe?: string;
  secondaryRangeTimeframe?: string;
  ai?: {
    enabled?: boolean;
    lookbackCandles?: number;
    cadenceBars?: number;
    maxEvaluations?: number;
    confidenceThreshold?: number;
    modelPrimary?: string;
    modelFallback?: string;
  };
}

export interface CreateBotRequest {
  name?: string;
  symbol: string;
  strategyId?: string;
  strategyVersion?: string;
  exchangeId?: string;
  accountId?: string;
  enabled?: boolean;
  executionTimeframe?: string;
  primaryRangeTimeframe?: string;
  secondaryRangeTimeframe?: string;
  executionLimit?: number;
  primaryRangeLimit?: number;
  secondaryRangeLimit?: number;
  dryRun?: boolean;
  marginMode?: "CROSS" | "ISOLATED";
  valueQty?: string;
  strategyConfig?: Record<string, unknown>;
}

export interface PatchBotRequest {
  name?: string;
  accountId?: string;
  status?: "active" | "paused" | "archived";
  enabled?: boolean;
  executionTimeframe?: string;
  primaryRangeTimeframe?: string;
  secondaryRangeTimeframe?: string;
  executionLimit?: number;
  primaryRangeLimit?: number;
  secondaryRangeLimit?: number;
  dryRun?: boolean;
  marginMode?: "CROSS" | "ISOLATED";
  valueQty?: string;
  strategyConfig?: Record<string, unknown>;
}

export async function patchBot(
  botId: string,
  request: PatchBotRequest,
): Promise<BotRecordView> {
  const response = await fetch(
    `${API_URL}/v1/bots/${encodeURIComponent(botId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

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
      // ignore
    }
    throw new Error(
      `API request failed (${response.status})${details ? `: ${details}` : ""}`,
    );
  }

  const payload = (await response.json()) as {
    generatedAt: string;
    bot: BotRecordView;
  };
  return payload.bot;
}

export interface CreateRangeValidationRequest {
  symbol?: string;
  timeframe?: string;
  fromMs?: number;
  toMs?: number;
  candlesCount?: number;
  confidenceThreshold?: number;
}

export async function fetchBacktests(
  limit = 50,
  botId?: string,
): Promise<BacktestRecord[]> {
  if (botId) {
    const payload = await getJson<{ backtests: BacktestRecord[] }>(
      `/v1/bots/${encodeURIComponent(botId)}/backtests?limit=${encodeURIComponent(String(limit))}`,
    );
    return payload.backtests;
  }

  const query = new URLSearchParams({ limit: String(limit) });
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
    `/v1/backtests/${encodedId}${suffix ? `?${suffix}` : ""}`,
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
  botId: string,
  request: CreateBacktestRequest,
): Promise<BacktestRecord> {
  const payload = await postJson<{ backtest: BacktestRecord }>(
    `/v1/bots/${encodeURIComponent(botId)}/backtests`,
    request,
  );
  return payload.backtest;
}

export async function createRangeValidation(
  botId: string,
  request: CreateRangeValidationRequest,
): Promise<RangeValidationRecord> {
  const payload = await postJson<{ validation: RangeValidationRecord }>(
    `/v1/bots/${encodeURIComponent(botId)}/validations`,
    request,
  );
  return payload.validation;
}

export async function fetchRangeValidations(
  limit = 50,
  botId?: string,
): Promise<RangeValidationRecord[]> {
  if (botId) {
    const payload = await getJson<{ validations: RangeValidationRecord[] }>(
      `/v1/bots/${encodeURIComponent(botId)}/validations?limit=${encodeURIComponent(String(limit))}`,
    );
    return payload.validations;
  }

  const query = new URLSearchParams({ limit: String(limit) });
  const payload = await getJson<{ validations: RangeValidationRecord[] }>(
    `/v1/ranging/validations?${query.toString()}`,
  );
  return payload.validations;
}

export async function fetchBotStats(
  botId?: string,
  windowHours = 24,
): Promise<BotStatsSummary> {
  const query = new URLSearchParams({ windowHours: String(windowHours) });
  if (botId) {
    return getJson<BotStatsSummary>(
      `/v1/bots/${encodeURIComponent(botId)}/stats?${query.toString()}`,
    );
  }
  return getJson<BotStatsSummary>(`/v1/ranging/bots/stats?${query.toString()}`);
}

export async function fetchBotPositions(
  botId: string,
): Promise<BotPositionsPayload> {
  return getJson<BotPositionsPayload>(
    `/v1/bots/${encodeURIComponent(botId)}/positions`,
  );
}
