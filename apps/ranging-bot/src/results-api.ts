import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  createIndicatorParamsHash,
  type BotDefinition,
  type ExecutionContext,
} from "@repo/trading-engine";
import { Resource } from "sst";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import type { Candle, EquityPoint } from "@repo/ranging-core";
import {
  buildBotSummaries,
  computeDashboardMetrics,
  mapRunsToTrades,
} from "./monitoring/analytics";
import { runtimeAccountResolver } from "./account-resolver";
import { exchangeAdapterRegistry } from "./exchange-adapter-registry";
import {
  createBacktestIdentity,
  createFailedBacktestRecord,
  createRunningBacktestRecord,
  replayBacktestRecord,
} from "./monitoring/backtests";
import {
  BACKTEST_EVENT_DETAIL_TYPE_REQUESTED,
  BACKTEST_EVENT_SOURCE,
  type BacktestRequestedDetail,
} from "./monitoring/backtest-events";
import {
  RANGE_VALIDATION_EVENT_DETAIL_TYPE_REQUESTED,
  RANGE_VALIDATION_EVENT_SOURCE,
  type RangeValidationRequestedDetail,
} from "./monitoring/validation-events";
import {
  getAccountRecordById,
  getBotRecordById,
  getBotRecordBySymbol,
  getBacktestById,
  deleteBacktestRecord,
  getLatestOpenPositionByBot,
  getRangeValidationById,
  getRunBySymbolAndTime,
  listFillsByBot,
  listAccountRecords,
  listBotRecords,
  listLatestRunsByBotIds,
  listOrdersByBot,
  listReconciliationEventsByBot,
  listRecentRangeValidations,
  listRecentRangeValidationsByBotId,
  listRecentRangeValidationsBySymbol,
  listRecentBacktests,
  listRecentBacktestsByBotId,
  listRecentBacktestsBySymbol,
  listRecentRuns,
  listPositionsByBot,
  listRecentRunsBySymbol,
  putAccountRecord,
  putBotRecord,
  putBacktestRecord,
  putRangeValidationRecord,
} from "./monitoring/store";
import {
  getIndicatorFeedState,
  getMarketFeedState,
} from "./feed-store";
import type {
  AccountRecord,
  AccountSummary,
  AccountSymbolSummary,
  BacktestAiConfig,
  BacktestRecord,
  BacktestTradeView,
  BotRecord,
  BotStatsSummary,
  BotIndicatorPoolPayload,
  BotRunRecord,
  DashboardPayload,
  KlineCacheReference,
  PositionRecord,
  StrategyDetailsPayload,
  StrategySummary,
  TradeSignalRecord,
} from "./monitoring/types";
import { fetchTradeContextKlines } from "./monitoring/kucoin-public-klines";
import { decodeTradeId } from "./monitoring/trades";
import type { OrchestratorTimeframe } from "./contracts";
import { strategyRegistry } from "./strategy-registry";
import {
  normalizeBotConfig,
  toBotDefinition,
  type RuntimeBotConfig,
} from "./runtime-config";
import { getRuntimeSettings } from "./runtime-settings";
import { loadConfiguredBots } from "./runtime-bots";
import {
  getCachedExchangeSymbols,
  refreshExchangeSymbols,
} from "./symbol-catalog";
import {
  createFailedValidationRecord,
  createPendingValidationRecord,
  createValidationIdentity,
} from "./monitoring/validations";
import { loadLatestIndicatorFeedSnapshot } from "./shared-indicator-snapshots";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const DEFAULT_BARS_BEFORE = 80;
const DEFAULT_BARS_AFTER = 80;
const MAX_BARS_CONTEXT = 300;
const DEFAULT_BACKTEST_PERIOD_DAYS = 30;
const MAX_BACKTEST_PERIOD_DAYS = 365;
const DEFAULT_STATS_WINDOW_HOURS = 24;
const MAX_STATS_WINDOW_HOURS = 24 * 30;
const DEFAULT_BACKTEST_CHART_TIMEFRAME: OrchestratorTimeframe = "4h";
const DEFAULT_VALIDATION_TIMEFRAME: OrchestratorTimeframe = "15m";
const DEFAULT_VALIDATION_CANDLE_COUNT = 240;
const MAX_VALIDATION_CANDLE_COUNT = 600;
const DEFAULT_BACKTEST_AI_LOOKBACK_CANDLES = 240;
const DEFAULT_BACKTEST_AI_CADENCE_BARS = 1;
const DEFAULT_BACKTEST_AI_MAX_EVALUATIONS = 50;
const MAX_BACKTEST_AI_EVALUATIONS = 400;
const DEFAULT_BACKTEST_RUNNING_STALE_MS = 20 * 60_000;
const DEFAULT_VALIDATION_CONFIDENCE_THRESHOLD = 0.72;
const DEFAULT_VALIDATION_MODEL_PRIMARY = "gpt-5-nano-2025-08-07";
const DEFAULT_VALIDATION_MODEL_FALLBACK = "gpt-5-mini-2025-08-07";
const SUPPORTED_EXCHANGE_IDS = new Set(["kucoin"]);

let cachedEventBridgeClient: EventBridgeClient | null = null;

const timeframeMs: Record<OrchestratorTimeframe, number> = {
  "1m": 60_000,
  "3m": 3 * 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "8h": 8 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
};

function json(statusCode: number, data: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(data),
  };
}

function getEventBridgeClient(): EventBridgeClient {
  if (cachedEventBridgeClient) return cachedEventBridgeClient;
  cachedEventBridgeClient = new EventBridgeClient({});
  return cachedEventBridgeClient;
}

function getBacktestBusName(): string {
  const resources = Resource as unknown as Record<
    string,
    { name?: string } | undefined
  >;
  const linkedName = resources.RangingBacktestBus?.name;
  if (linkedName && linkedName.trim().length > 0) {
    return linkedName.trim();
  }

  throw new Error("Missing linked Resource.RangingBacktestBus");
}

async function publishBacktestRequested(
  detail: BacktestRequestedDetail,
): Promise<void> {
  const busName = getBacktestBusName();
  const result = await getEventBridgeClient().send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: busName,
          Source: BACKTEST_EVENT_SOURCE,
          DetailType: BACKTEST_EVENT_DETAIL_TYPE_REQUESTED,
          Detail: JSON.stringify(detail),
        },
      ],
    }),
  );

  if ((result.FailedEntryCount ?? 0) > 0) {
    const first = result.Entries?.[0];
    const message = first
      ? `${first.ErrorCode ?? "unknown_error"}: ${first.ErrorMessage ?? "unknown"}`
      : "unknown_eventbridge_error";
    throw new Error(`EventBridge rejected backtest event (${message})`);
  }
}

async function publishRangeValidationRequested(
  detail: RangeValidationRequestedDetail,
): Promise<void> {
  const busName = getBacktestBusName();
  const result = await getEventBridgeClient().send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: busName,
          Source: RANGE_VALIDATION_EVENT_SOURCE,
          DetailType: RANGE_VALIDATION_EVENT_DETAIL_TYPE_REQUESTED,
          Detail: JSON.stringify(detail),
        },
      ],
    }),
  );

  if ((result.FailedEntryCount ?? 0) > 0) {
    const first = result.Entries?.[0];
    const message = first
      ? `${first.ErrorCode ?? "unknown_error"}: ${first.ErrorMessage ?? "unknown"}`
      : "unknown_eventbridge_error";
    throw new Error(`EventBridge rejected range validation event (${message})`);
  }
}

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseSymbols(raw: string | undefined): string[] {
  if (!raw) return [];

  return [
    ...new Set(
      raw
        .split(",")
        .map((symbol) => symbol.trim())
        .filter((symbol) => symbol.length > 0),
    ),
  ];
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];

  return [
    ...new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ];
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  max: number,
): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function parseConfidence(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return 0;
  if (parsed >= 1) return 1;
  return parsed;
}

function normalizePositiveNumber(
  raw: unknown,
  fallback: number,
  max: number,
): number {
  if (raw === undefined || raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function sanitizeSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default"
  );
}

function buildAccountId(exchangeId: string, name: string): string {
  return `${sanitizeSegment(exchangeId)}-${sanitizeSegment(name)}`;
}

function toAccountSummary(account: AccountRecord): AccountSummary {
  return {
    id: account.id,
    name: account.name,
    exchangeId: account.exchangeId,
    status: account.status,
    createdAtMs: account.createdAtMs,
    updatedAtMs: account.updatedAtMs,
    hasAuth: {
      apiKey: account.auth.apiKey.trim().length > 0,
      apiSecret: account.auth.apiSecret.trim().length > 0,
      apiPassphrase: (account.auth.apiPassphrase?.trim().length ?? 0) > 0,
    },
  };
}

function createAccountInspectionBot(account: AccountRecord): BotDefinition {
  const nowMs = Date.now();
  return {
    id: `account-inspection-${account.id}`,
    name: `Account Inspection ${account.name}`,
    strategyId: "account-inspection",
    strategyVersion: "1",
    exchangeId: account.exchangeId,
    accountId: account.id,
    symbol: "ACCOUNT",
    marketType: "futures",
    status: "active",
    execution: {
      trigger: "event",
      executionTimeframe: "1h",
      warmupBars: 0,
    },
    context: {
      primaryPriceTimeframe: "1h",
      additionalTimeframes: [],
      providers: [],
    },
    riskProfileId: `${account.id}:inspection`,
    strategyConfig: {},
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

function createAccountExecutionContext(
  account: AccountRecord,
): ExecutionContext<AccountRecord> {
  return {
    bot: createAccountInspectionBot(account),
    account,
    exchangeId: account.exchangeId,
    nowMs: Date.now(),
    dryRun: true,
    metadata: {
      source: "account-api",
    },
  };
}

function isTruthyQueryFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

async function enrichAccountSummaryWithBalance(
  account: AccountRecord,
): Promise<AccountSummary> {
  const summary = toAccountSummary(account);

  if (account.status === "archived") {
    return summary;
  }

  try {
    const resolvedAccount = await runtimeAccountResolver.getAccount(
      account.id,
      account.exchangeId,
    );
    if (!resolvedAccount) {
      return summary;
    }
    const executionAdapter = exchangeAdapterRegistry.getPrivate(
      account.exchangeId,
    );
    const reader = executionAdapter.createAccountBalanceReader?.({
      bot: {
        id: `account-balance-${account.id}`,
        name: `account-balance-${account.name}`,
        strategyId: "account-balance",
        strategyVersion: "1",
        exchangeId: account.exchangeId,
        accountId: account.id,
        symbol: "ACCOUNT",
        marketType: "futures",
        status: "active",
        execution: {
          trigger: "event",
          executionTimeframe: "1h",
          warmupBars: 0,
        },
        context: {
          primaryPriceTimeframe: "1h",
          additionalTimeframes: [],
          providers: [],
        },
        riskProfileId: "account-balance",
        strategyConfig: {},
        createdAtMs: account.createdAtMs,
        updatedAtMs: account.updatedAtMs,
      },
      account: resolvedAccount,
      exchangeId: account.exchangeId,
      nowMs: Date.now(),
      dryRun: true,
      metadata: {
        purpose: "account-balance-read",
      },
    });

    if (!reader) {
      return summary;
    }

    const balance = await reader.getBalance("USDT");
    return {
      ...summary,
      balance: {
        currency: balance.currency,
        available: balance.available,
        total: balance.total,
        fetchedAtMs: Date.now(),
      },
    };
  } catch (error) {
    return {
      ...summary,
      balance: {
        currency: "USDT",
        available: 0,
        total: 0,
        fetchedAtMs: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function normalizeExchangeId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeNonEmptyString(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStatus(
  raw: unknown,
): "active" | "paused" | "archived" | undefined {
  return raw === "active" || raw === "paused" || raw === "archived"
    ? raw
    : undefined;
}

function isSupportedExchangeId(exchangeId: string): boolean {
  return SUPPORTED_EXCHANGE_IDS.has(exchangeId);
}

function isTimeframe(
  value: string | undefined,
): value is OrchestratorTimeframe {
  return Boolean(value && value in timeframeMs);
}

function timeframeDurationMs(timeframe: OrchestratorTimeframe): number {
  return timeframeMs[timeframe];
}

function isBacktestChartTimeframe(
  value: string | undefined,
): value is "15m" | "1h" | "2h" | "4h" | "1d" {
  return (
    value === "15m" ||
    value === "1h" ||
    value === "2h" ||
    value === "4h" ||
    value === "1d"
  );
}

function parseJsonBody<T>(event: APIGatewayProxyEventV2): T | null {
  if (!event.body) return null;
  if (event.isBase64Encoded) return null;

  try {
    return JSON.parse(event.body) as T;
  } catch {
    return null;
  }
}

function parseBacktestStaleMs(): number {
  const raw = getRuntimeSettings().backtestRunningStaleMs;
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_BACKTEST_RUNNING_STALE_MS;
  }
  return Math.floor(raw);
}

function isStaleRunningBacktest(
  backtest: BacktestRecord,
  nowMs = Date.now(),
): boolean {
  return (
    backtest.status === "running" &&
    nowMs - backtest.createdAtMs > parseBacktestStaleMs()
  );
}

async function markBacktestAsFailed(
  backtest: BacktestRecord,
  reason: string,
): Promise<BacktestRecord> {
  const failed: BacktestRecord = {
    ...backtest,
    status: "failed",
    errorMessage: reason,
  };
  await putBacktestRecord(failed);
  return failed;
}

async function markStaleBacktests(
  backtests: BacktestRecord[],
): Promise<BacktestRecord[]> {
  const nowMs = Date.now();
  const out = [...backtests];

  for (let index = 0; index < out.length; index += 1) {
    const backtest = out[index];
    if (!backtest || !isStaleRunningBacktest(backtest, nowMs)) continue;

    try {
      out[index] = await markBacktestAsFailed(
        backtest,
        "Backtest timed out while running. Retry with lower AI max calls or wider cadence.",
      );
    } catch (error) {
      console.error("[ranging-api] failed to mark stale backtest", {
        backtestId: backtest.id,
        symbol: backtest.symbol,
        error,
      });
    }
  }

  return out;
}

function haveRefsChanged(
  previous: KlineCacheReference[] | undefined,
  next: KlineCacheReference[] | undefined,
): boolean {
  const prevKeys = new Set((previous ?? []).map((ref) => ref.key));
  const nextKeys = new Set((next ?? []).map((ref) => ref.key));
  if (prevKeys.size !== nextKeys.size) return true;

  for (const key of nextKeys) {
    if (!prevKeys.has(key)) return true;
  }

  return false;
}

async function persistBacktestRefsIfNeeded(
  backtest: BacktestRecord,
  refs: KlineCacheReference[] | undefined,
): Promise<BacktestRecord> {
  if (!refs || refs.length === 0) return backtest;
  if (!haveRefsChanged(backtest.klineRefs, refs)) return backtest;

  const updated: BacktestRecord = {
    ...backtest,
    klineRefs: refs,
  };

  try {
    await putBacktestRecord(updated);
    return updated;
  } catch (error) {
    console.error("[ranging-api] failed to persist backtest kline refs", {
      backtestId: backtest.id,
      symbol: backtest.symbol,
      error,
    });
    return backtest;
  }
}

async function syncConfiguredBots(): Promise<BotRecord[]> {
  return loadConfiguredBots();
}

function includeBotInPrimaryListings(bot: BotRecord): boolean {
  return bot.status !== "archived";
}

function completedBacktests(backtests: BacktestRecord[]): BacktestRecord[] {
  return backtests.filter((backtest) => backtest.status === "completed");
}

function buildStrategyPerformanceStats(backtests: BacktestRecord[]) {
  const completed = completedBacktests(backtests);
  const latestCompleted = completed[0];

  return {
    netPnl: completed.reduce((sum, backtest) => sum + backtest.netPnl, 0),
    grossProfit: completed.reduce(
      (sum, backtest) => sum + backtest.grossProfit,
      0,
    ),
    grossLoss: completed.reduce((sum, backtest) => sum + backtest.grossLoss, 0),
    winRate:
      completed.length > 0
        ? completed.reduce((sum, backtest) => sum + backtest.winRate, 0) /
          completed.length
        : 0,
    totalTrades: backtests.reduce(
      (sum, backtest) => sum + backtest.totalTrades,
      0,
    ),
    profitableBacktests: completed.filter((backtest) => backtest.netPnl > 0)
      .length,
    latestNetPnl: latestCompleted?.netPnl,
    maxDrawdownPct: latestCompleted?.maxDrawdownPct,
  };
}

function buildPositionLifecycleStats(positions: PositionRecord[]) {
  return {
    openPositions: positions.filter((position) => position.status === "open")
      .length,
    reducingPositions: positions.filter(
      (position) => position.status === "reducing",
    ).length,
    closingPositions: positions.filter(
      (position) => position.status === "closing",
    ).length,
    reconciliationsPending: positions.filter(
      (position) => position.status === "reconciling",
    ).length,
    forcedCloseCount: 0,
    breakevenMoves: 0,
  };
}

function buildBacktestStats(backtests: BacktestRecord[]) {
  const completed = completedBacktests(backtests);
  const latestCompleted = completed[0];

  return {
    total: backtests.length,
    running: backtests.filter((backtest) => backtest.status === "running")
      .length,
    completed: completed.length,
    failed: backtests.filter((backtest) => backtest.status === "failed").length,
    profitable: completed.filter((backtest) => backtest.netPnl > 0).length,
    latestNetPnl: latestCompleted?.netPnl,
  };
}

function toStrategyConfigRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function mergeStrategyConfigDefaults(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(defaults)) as Record<string, unknown>;

  for (const [key, value] of Object.entries(overrides)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      next[key] &&
      typeof next[key] === "object" &&
      !Array.isArray(next[key])
    ) {
      next[key] = mergeStrategyConfigDefaults(
        toStrategyConfigRecord(next[key]),
        value as Record<string, unknown>,
      );
      continue;
    }

    next[key] = value;
  }

  return next;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildStrategyConfigVariants(
  backtests: BacktestRecord[],
  configDefaults: Record<string, unknown>,
) {
  const variants = new Map<
    string,
    {
      key: string;
      strategyConfig: Record<string, unknown>;
      backtestCount: number;
      completedCount: number;
      netPnlTotal: number;
      winRateTotal: number;
      bestNetPnl?: number;
      worstNetPnl?: number;
      latestCreatedAtMs: number;
      sampleBacktestId?: string;
    }
  >();

  for (const backtest of backtests) {
    const strategyConfig = mergeStrategyConfigDefaults(
      configDefaults,
      toStrategyConfigRecord(backtest.strategyConfig),
    );
    const key = stableStringify(strategyConfig);
    const current = variants.get(key) ?? {
      key,
      strategyConfig,
      backtestCount: 0,
      completedCount: 0,
      netPnlTotal: 0,
      winRateTotal: 0,
      bestNetPnl: undefined,
      worstNetPnl: undefined,
      latestCreatedAtMs: 0,
      sampleBacktestId: undefined,
    };

    current.backtestCount += 1;
    current.latestCreatedAtMs = Math.max(
      current.latestCreatedAtMs,
      backtest.createdAtMs,
    );
    current.sampleBacktestId ??= backtest.id;

    if (backtest.status === "completed") {
      current.completedCount += 1;
      current.netPnlTotal += backtest.netPnl;
      current.winRateTotal += backtest.winRate;
      current.bestNetPnl =
        current.bestNetPnl === undefined
          ? backtest.netPnl
          : Math.max(current.bestNetPnl, backtest.netPnl);
      current.worstNetPnl =
        current.worstNetPnl === undefined
          ? backtest.netPnl
          : Math.min(current.worstNetPnl, backtest.netPnl);
    }

    variants.set(key, current);
  }

  return [...variants.values()]
    .map((variant) => ({
      key: variant.key,
      strategyConfig: variant.strategyConfig,
      backtestCount: variant.backtestCount,
      completedCount: variant.completedCount,
      avgNetPnl:
        variant.completedCount > 0
          ? variant.netPnlTotal / variant.completedCount
          : 0,
      avgWinRate:
        variant.completedCount > 0
          ? variant.winRateTotal / variant.completedCount
          : 0,
      bestNetPnl: variant.bestNetPnl,
      worstNetPnl: variant.worstNetPnl,
      latestCreatedAtMs: variant.latestCreatedAtMs,
      sampleBacktestId: variant.sampleBacktestId,
    }))
    .sort(
      (left, right) =>
        right.avgNetPnl - left.avgNetPnl ||
        right.completedCount - left.completedCount ||
        right.latestCreatedAtMs - left.latestCreatedAtMs,
    );
}

async function loadStrategySummaries(
  windowHours: number,
  runsLimit: number,
  backtestLimit: number,
): Promise<StrategySummary[]> {
  const bots = await syncConfiguredBots();
  const manifests = strategyRegistry.listManifests();
  const [runs, backtests, positionsByBot] = await Promise.all([
    listRecentRuns(runsLimit),
    listRecentBacktests(backtestLimit),
    Promise.all(bots.map((bot) => listPositionsByBot(bot.id, 20))),
  ]);

  const latestRuns =
    bots.length > 0
      ? await listLatestRunsByBotIds(bots.map((bot) => bot.id))
      : [];
  const summariesByBot = buildBotSummaries(bots, latestRuns);
  const summaryByBotId = new Map(summariesByBot.map((bot) => [bot.botId, bot]));

  const windowStartMs = Date.now() - windowHours * 60 * 60_000;
  const positions = positionsByBot.flat();

  return manifests
    .map((manifest) => {
      const strategyBots = bots.filter((bot) => bot.strategyId === manifest.id);
      const strategyBotIds = new Set(strategyBots.map((bot) => bot.id));
      const strategyRuns = runs.filter((run) => strategyBotIds.has(run.botId));
      const strategyRunsInWindow = strategyRuns.filter(
        (run) => run.generatedAtMs >= windowStartMs,
      );
      const strategyBacktests = backtests.filter((backtest) =>
        strategyBotIds.has(backtest.botId),
      );
      const strategyPositions = positions.filter((position) =>
        strategyBotIds.has(position.botId),
      );

      return {
        strategyId: manifest.id,
        label: manifest.label,
        description: manifest.description,
        manifestVersion: manifest.version,
        configJsonSchema: manifest.configJsonSchema,
        configUi: manifest.configUi,
        configDefaults: toStrategyConfigRecord(manifest.getDefaultConfig()),
        analysisJsonSchema: manifest.analysisJsonSchema,
        analysisUi: manifest.analysisUi,
        configuredVersions: [
          ...new Set(strategyBots.map((bot) => bot.strategyVersion)),
        ].sort(),
        configuredBots: strategyBots.length,
        activeBots: strategyBots.filter((bot) => bot.status === "active")
          .length,
        symbols: [...new Set(strategyBots.map((bot) => bot.symbol))].sort(),
        operations: computeDashboardMetrics(strategyRunsInWindow),
        strategy: buildStrategyPerformanceStats(strategyBacktests),
        positions: buildPositionLifecycleStats(strategyPositions),
        backtests: buildBacktestStats(strategyBacktests),
        bots: strategyBots
          .map((bot) => summaryByBotId.get(bot.id))
          .filter((bot): bot is NonNullable<typeof bot> => Boolean(bot)),
      };
    })
    .map(({ bots: _bots, ...summary }) => summary)
    .sort(
      (a, b) =>
        b.configuredBots - a.configuredBots || a.label.localeCompare(b.label),
    );
}

async function resolveBotById(botId: string): Promise<BotRecord | undefined> {
  return getBotRecordById(botId);
}

async function resolveBotBySymbol(
  symbol: string,
): Promise<BotRecord | undefined> {
  return getBotRecordBySymbol(symbol);
}

async function loadStrategyDetails(
  strategyId: string,
  windowHours: number,
  runsLimit: number,
  backtestLimit: number,
): Promise<StrategyDetailsPayload | undefined> {
  let manifest;
  try {
    manifest = strategyRegistry.getManifest(strategyId);
  } catch {
    return undefined;
  }

  const bots = (await syncConfiguredBots()).filter(
    (bot) => bot.strategyId === strategyId,
  );

  const botIds = new Set(bots.map((bot) => bot.id));
  const [runs, backtests, positionsByBot, latestRuns] = await Promise.all([
    listRecentRuns(runsLimit),
    listRecentBacktests(backtestLimit),
    Promise.all(bots.map((bot) => listPositionsByBot(bot.id, 20))),
    listLatestRunsByBotIds(bots.map((bot) => bot.id)),
  ]);

  const summaries = buildBotSummaries(bots, latestRuns);
  const strategyRuns = runs.filter((run) => botIds.has(run.botId));
  const strategyRunsInWindow = strategyRuns.filter(
    (run) => run.generatedAtMs >= Date.now() - windowHours * 60 * 60_000,
  );
  const strategyBacktests = backtests.filter((backtest) =>
    botIds.has(backtest.botId),
  );
  const strategyPositions = positionsByBot.flat();
  const configDefaults = toStrategyConfigRecord(manifest.getDefaultConfig());
  const completedStrategyBacktests = completedBacktests(strategyBacktests);

  return {
    generatedAt: new Date().toISOString(),
    strategy: {
      strategyId,
      label: manifest.label,
      description: manifest.description,
      manifestVersion: manifest.version,
      configJsonSchema: manifest.configJsonSchema,
      configUi: manifest.configUi,
      configDefaults,
      analysisJsonSchema: manifest.analysisJsonSchema,
      analysisUi: manifest.analysisUi,
      configuredVersions: [
        ...new Set(bots.map((bot) => bot.strategyVersion)),
      ].sort(),
      configuredBots: bots.length,
      activeBots: bots.filter((bot) => bot.status === "active").length,
      symbols: [...new Set(bots.map((bot) => bot.symbol))].sort(),
      operations: computeDashboardMetrics(strategyRunsInWindow),
      strategy: buildStrategyPerformanceStats(strategyBacktests),
      positions: buildPositionLifecycleStats(strategyPositions),
      backtests: buildBacktestStats(strategyBacktests),
    },
    bots: summaries,
    recentRuns: strategyRuns
      .sort((a, b) => b.generatedAtMs - a.generatedAtMs)
      .slice(0, runsLimit),
    recentBacktests: strategyBacktests
      .slice()
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, Math.min(backtestLimit, 12)),
    bestBacktests: completedStrategyBacktests.slice(0, 5),
    worstBacktests: completedStrategyBacktests
      .slice()
      .sort((a, b) => a.netPnl - b.netPnl)
      .slice(0, 5),
    configVariants: buildStrategyConfigVariants(
      strategyBacktests,
      configDefaults,
    ).slice(0, 8),
  };
}

async function loadExchangeSymbolsPayload(exchangeId: string): Promise<{
  exchangeId: string;
  count: number;
  generatedAtSource: string;
  source: "cache" | "live";
  symbols: AccountSymbolSummary[];
}> {
  const cached = await getCachedExchangeSymbols(exchangeId);
  if (cached && cached.symbols.length > 0) {
    return {
      exchangeId,
      count: cached.symbols.length,
      generatedAtSource: cached.generatedAt,
      source: "cache",
      symbols: cached.symbols as AccountSymbolSummary[],
    };
  }

  const refreshed = await refreshExchangeSymbols(exchangeId);
  return {
    exchangeId,
    count: refreshed.symbols.length,
    generatedAtSource: refreshed.generatedAt,
    source: "live",
    symbols: refreshed.symbols as AccountSymbolSummary[],
  };
}

function getBotDefaults(bot: BotRecord): {
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
} {
  return {
    executionTimeframe: bot.runtime.executionTimeframe,
    primaryRangeTimeframe: bot.runtime.primaryRangeTimeframe,
    secondaryRangeTimeframe: bot.runtime.secondaryRangeTimeframe,
  };
}

async function loadDashboard(
  limit: number,
  botIds?: string[],
): Promise<DashboardPayload> {
  const recentRuns = await listRecentRuns(limit);
  const configuredBots = await syncConfiguredBots();
  const selectedBots =
    botIds && botIds.length > 0
      ? configuredBots.filter(
          (bot) => botIds.includes(bot.id) && includeBotInPrimaryListings(bot),
        )
      : configuredBots.filter(includeBotInPrimaryListings);

  const latestRunsByBotId =
    selectedBots.length > 0
      ? await listLatestRunsByBotIds(selectedBots.map((bot) => bot.id))
      : [];

  const mappedTrades = mapRunsToTrades(recentRuns);

  return {
    generatedAt: new Date().toISOString(),
    metrics: computeDashboardMetrics(recentRuns),
    bots: buildBotSummaries(selectedBots, latestRunsByBotId),
    recentRuns,
    trades: mappedTrades,
  };
}

export async function healthHandler(): Promise<APIGatewayProxyResultV2> {
  return json(200, {
    ok: true,
    service: "ranging-bot-api",
    time: new Date().toISOString(),
  });
}

export async function dashboardHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const limit = parseLimit(event.queryStringParameters?.limit);
    const botIds = parseIds(event.queryStringParameters?.botIds);
    const payload = await loadDashboard(limit, botIds);
    return json(200, payload);
  } catch (error) {
    console.error("[ranging-api] dashboard failed", { error });
    return json(500, {
      error: "failed_to_load_dashboard",
    });
  }
}

export async function runsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const limit = parseLimit(event.queryStringParameters?.limit);
    const botId = event.queryStringParameters?.botId?.trim();
    const symbol = event.queryStringParameters?.symbol?.trim();

    const runs = botId
      ? (await listRecentRuns(limit)).filter((run) => run.botId === botId)
      : symbol
        ? await listRecentRunsBySymbol(symbol, limit)
        : await listRecentRuns(limit);

    return json(200, {
      generatedAt: new Date().toISOString(),
      count: runs.length,
      runs,
    });
  } catch (error) {
    console.error("[ranging-api] runs failed", { error });
    return json(500, {
      error: "failed_to_load_runs",
    });
  }
}

export async function botRunsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawBotId = event.pathParameters?.botId?.trim();
  if (!rawBotId) {
    return json(400, { error: "missing_bot_id" });
  }

  try {
    const limit = parseLimit(event.queryStringParameters?.limit);
    const botId = decodeURIComponent(rawBotId);
    const runs = (await listRecentRuns(limit)).filter(
      (run) => run.botId === botId,
    );

    return json(200, {
      generatedAt: new Date().toISOString(),
      count: runs.length,
      runs,
    });
  } catch (error) {
    console.error("[bot-api] bot runs failed", { error });
    return json(500, {
      error: "failed_to_load_runs",
    });
  }
}

export async function botsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const botIds = parseIds(event.queryStringParameters?.botIds);
    const configuredBots = await syncConfiguredBots();
    const selectedBots =
      botIds.length > 0
        ? configuredBots.filter(
            (bot) =>
              botIds.includes(bot.id) && includeBotInPrimaryListings(bot),
          )
        : configuredBots.filter(includeBotInPrimaryListings);
    const latestRuns =
      selectedBots.length > 0
        ? await listLatestRunsByBotIds(selectedBots.map((bot) => bot.id))
        : [];

    const bots = buildBotSummaries(selectedBots, latestRuns);

    return json(200, {
      generatedAt: new Date().toISOString(),
      count: bots.length,
      bots,
    });
  } catch (error) {
    console.error("[ranging-api] bots failed", { error });
    return json(500, {
      error: "failed_to_load_bots",
    });
  }
}

export async function accountsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const limit = parseLimit(event.queryStringParameters?.limit);
    const exchangeId = normalizeExchangeId(
      event.queryStringParameters?.exchangeId,
    );
    const includeBalance = isTruthyQueryFlag(
      event.queryStringParameters?.includeBalance,
    );
    const filteredAccounts = (await listAccountRecords(limit)).filter(
      (account) => !exchangeId || account.exchangeId === exchangeId,
    );
    const accounts = includeBalance
      ? await Promise.all(
          filteredAccounts.map((account) =>
            enrichAccountSummaryWithBalance(account),
          ),
        )
      : filteredAccounts.map((account) => toAccountSummary(account));

    return json(200, {
      generatedAt: new Date().toISOString(),
      count: accounts.length,
      accounts,
    });
  } catch (error) {
    console.error("[account-api] accounts failed", { error });
    return json(500, { error: "failed_to_load_accounts" });
  }
}

export async function createAccountHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = parseJsonBody<CreateAccountBody>(event);
    if (!body) {
      return json(400, { error: "invalid_json_body" });
    }

    const exchangeId = normalizeExchangeId(body.exchangeId);
    const name = normalizeNonEmptyString(body.name);
    const apiKey = normalizeNonEmptyString(body.auth?.apiKey);
    const apiSecret = normalizeNonEmptyString(body.auth?.apiSecret);
    const apiPassphrase = normalizeNonEmptyString(body.auth?.apiPassphrase);

    if (!exchangeId) {
      return json(400, { error: "missing_exchange_id" });
    }
    if (!isSupportedExchangeId(exchangeId)) {
      return json(400, { error: "unsupported_exchange" });
    }
    if (!name) {
      return json(400, { error: "missing_account_name" });
    }
    if (!apiKey || !apiSecret) {
      return json(400, { error: "missing_account_auth" });
    }
    if (exchangeId === "kucoin" && !apiPassphrase) {
      return json(400, { error: "missing_account_passphrase" });
    }

    const accountId = buildAccountId(exchangeId, name);
    const existing = await getAccountRecordById(accountId);
    if (existing) {
      return json(409, {
        error: "account_already_exists",
        account: toAccountSummary(existing),
      });
    }

    const nowMs = Date.now();
    const account: AccountRecord = {
      id: accountId,
      name,
      exchangeId,
      status: "active",
      auth: {
        apiKey,
        apiSecret,
        apiPassphrase,
      },
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };

    await putAccountRecord(account);
    try {
      await refreshExchangeSymbols(account.exchangeId);
    } catch (error) {
      console.warn("[account-api] symbol cache prime failed", {
        accountId: account.id,
        exchangeId: account.exchangeId,
        error,
      });
    }
    return json(201, {
      generatedAt: new Date().toISOString(),
      account: toAccountSummary(account),
    });
  } catch (error) {
    console.error("[account-api] create account failed", { error });
    return json(500, { error: "failed_to_create_account" });
  }
}

export async function patchAccountHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawAccountId = event.pathParameters?.accountId?.trim();
  if (!rawAccountId) {
    return json(400, { error: "missing_account_id" });
  }

  try {
    const body = parseJsonBody<PatchAccountBody>(event);
    if (!body) {
      return json(400, { error: "invalid_json_body" });
    }

    const accountId = decodeURIComponent(rawAccountId);
    const existing = await getAccountRecordById(accountId);
    if (!existing) {
      return json(404, { error: "account_not_found" });
    }

    const status = normalizeStatus(body.status);
    if (body.status !== undefined && !status) {
      return json(400, { error: "invalid_account_status" });
    }
    const dependentBots = (await listBotRecords(500)).filter(
      (bot) => bot.accountId === existing.id && bot.status !== "archived",
    );
    if (status === "archived" && dependentBots.length > 0) {
      return json(409, {
        error: "account_in_use",
        details:
          "Pause or archive bots using this account before archiving the account.",
      });
    }

    const nextAuth = {
      ...existing.auth,
      ...(normalizeNonEmptyString(body.auth?.apiKey)
        ? { apiKey: normalizeNonEmptyString(body.auth?.apiKey) }
        : {}),
      ...(normalizeNonEmptyString(body.auth?.apiSecret)
        ? { apiSecret: normalizeNonEmptyString(body.auth?.apiSecret) }
        : {}),
      ...(body.auth?.apiPassphrase !== undefined
        ? {
            apiPassphrase: normalizeNonEmptyString(body.auth?.apiPassphrase),
          }
        : {}),
    };

    if (
      ((status ?? existing.status) === "active" ||
        (status ?? existing.status) === "paused") &&
      (!nextAuth.apiKey ||
        !nextAuth.apiSecret ||
        (existing.exchangeId === "kucoin" && !nextAuth.apiPassphrase))
    ) {
      return json(400, { error: "incomplete_account_auth" });
    }

    const updated: AccountRecord = {
      ...existing,
      status: status ?? existing.status,
      auth: nextAuth,
      updatedAtMs: Date.now(),
    };

    await putAccountRecord(updated);
    if (updated.status === "active") {
      try {
        await refreshExchangeSymbols(updated.exchangeId);
      } catch (error) {
        console.warn("[account-api] symbol cache refresh failed", {
          accountId: updated.id,
          exchangeId: updated.exchangeId,
          error,
        });
      }
    }
    return json(200, {
      generatedAt: new Date().toISOString(),
      account: toAccountSummary(updated),
    });
  } catch (error) {
    console.error("[account-api] patch account failed", { error });
    return json(500, { error: "failed_to_patch_account" });
  }
}

export async function exchangeSymbolsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawExchangeId = event.pathParameters?.exchangeId?.trim();
  const exchangeId = normalizeExchangeId(rawExchangeId);
  if (!exchangeId) {
    return json(400, { error: "missing_exchange_id" });
  }
  if (!isSupportedExchangeId(exchangeId)) {
    return json(400, { error: "unsupported_exchange" });
  }

  try {
    const payload = await loadExchangeSymbolsPayload(exchangeId);
    return json(200, {
      generatedAt: new Date().toISOString(),
      ...payload,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "exchange_symbols_not_cached"
    ) {
      return json(404, { error: "exchange_symbols_not_cached" });
    }
    console.error("[exchange-api] exchange symbols failed", {
      exchangeId,
      error,
    });
    return json(500, { error: "failed_to_load_exchange_symbols" });
  }
}

export async function accountSymbolsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawAccountId = event.pathParameters?.accountId?.trim();
  if (!rawAccountId) {
    return json(400, { error: "missing_account_id" });
  }

  try {
    const accountId = decodeURIComponent(rawAccountId);
    const account = await getAccountRecordById(accountId);
    if (!account) {
      return json(404, { error: "account_not_found" });
    }
    if (account.status !== "active") {
      return json(409, { error: "account_not_active" });
    }

    const payload = await loadExchangeSymbolsPayload(account.exchangeId);
    return json(200, {
      generatedAt: new Date().toISOString(),
      ...payload,
      accountId: account.id,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "exchange_symbols_not_cached"
    ) {
      return json(404, { error: "exchange_symbols_not_cached" });
    }
    console.error("[account-api] account symbols failed", { error });
    return json(500, { error: "failed_to_load_account_symbols" });
  }
}

export async function createBotHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = parseJsonBody<CreateBotBody>(event);
    if (!body) {
      return json(400, { error: "invalid_json_body" });
    }

    const exchangeId = normalizeExchangeId(body.exchangeId);
    const accountId = normalizeNonEmptyString(body.accountId);
    if (!exchangeId) {
      return json(400, { error: "missing_exchange_id" });
    }
    if (!isSupportedExchangeId(exchangeId)) {
      return json(400, { error: "unsupported_exchange" });
    }
    if (!accountId) {
      return json(400, { error: "missing_account_id" });
    }
    const strategyId = normalizeNonEmptyString(body.strategyId);
    if (!strategyId) {
      return json(400, { error: "missing_strategy_id" });
    }

    const normalized = normalizeBotConfig({
      ...body,
      exchangeId,
      accountId,
      strategyId,
    });
    if (!normalized) {
      return json(400, { error: "invalid_bot_config" });
    }

    let manifest;
    try {
      manifest = strategyRegistry.getManifest(strategyId);
    } catch {
      return json(400, { error: "unsupported_strategy" });
    }

    const resolvedStrategyConfig = toStrategyConfigRecord(
      manifest.resolveConfig(toStrategyConfigRecord(body.strategyConfig)),
    );

    const bot: BotRecord = {
      ...toBotDefinition({
        ...normalized,
        strategyConfig: resolvedStrategyConfig,
      }),
      runtime: {
        ...normalized,
        strategyConfig: resolvedStrategyConfig,
      },
    };

    const account = await getAccountRecordById(accountId);
    if (!account) {
      return json(400, { error: "unknown_account" });
    }
    if (account.status !== "active") {
      return json(400, { error: "inactive_account" });
    }
    if (account.exchangeId !== bot.exchangeId) {
      return json(400, { error: "account_exchange_mismatch" });
    }

    const existing = await getBotRecordById(bot.id);
    if (existing) {
      return json(409, { error: "bot_already_exists", bot: existing });
    }

    await putBotRecord(bot);
    return json(201, {
      generatedAt: new Date().toISOString(),
      bot,
    });
  } catch (error) {
    console.error("[bot-api] create bot failed", { error });
    return json(500, { error: "failed_to_create_bot" });
  }
}

export async function patchBotHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawBotId = event.pathParameters?.botId?.trim();
  if (!rawBotId) {
    return json(400, { error: "missing_bot_id" });
  }

  try {
    const body = parseJsonBody<PatchBotBody>(event);
    if (!body) {
      return json(400, { error: "invalid_json_body" });
    }

    const botId = decodeURIComponent(rawBotId);
    const existing = await resolveBotById(botId);
    if (!existing) {
      return json(404, { error: "bot_not_found" });
    }

    if (
      body.symbol !== undefined &&
      normalizeNonEmptyString(body.symbol)?.toUpperCase() !== existing.symbol
    ) {
      return json(400, { error: "symbol_is_immutable" });
    }
    if (
      body.exchangeId !== undefined &&
      normalizeExchangeId(body.exchangeId) !== existing.exchangeId
    ) {
      return json(400, { error: "exchange_is_immutable" });
    }
    if (
      body.strategyId !== undefined &&
      normalizeNonEmptyString(body.strategyId) !== existing.strategyId
    ) {
      return json(400, { error: "strategy_is_immutable" });
    }
    if (
      body.strategyVersion !== undefined &&
      normalizeNonEmptyString(body.strategyVersion) !== existing.strategyVersion
    ) {
      return json(400, { error: "strategy_version_is_immutable" });
    }

    const requestedStatus = normalizeStatus(body.status);
    if (body.status !== undefined && !requestedStatus) {
      return json(400, { error: "invalid_bot_status" });
    }

    const accountId =
      normalizeNonEmptyString(body.accountId) ?? existing.accountId;
    const accountValidationRequired = requestedStatus !== "archived";
    if (accountValidationRequired) {
      const account = await getAccountRecordById(accountId);
      if (!account) {
        return json(400, { error: "unknown_account" });
      }
      if (account.status !== "active") {
        return json(400, { error: "inactive_account" });
      }
      if (account.exchangeId !== existing.exchangeId) {
        return json(400, { error: "account_exchange_mismatch" });
      }
    }

    const normalized = normalizeBotConfig({
      ...existing.runtime,
      ...body,
      id: existing.id,
      name: normalizeNonEmptyString(body.name) ?? existing.name,
      symbol: existing.symbol,
      strategyId: existing.strategyId,
      strategyVersion: existing.strategyVersion,
      exchangeId: existing.exchangeId,
      accountId,
      enabled:
        requestedStatus === "archived"
          ? false
          : requestedStatus === "active"
            ? true
            : requestedStatus === "paused"
              ? false
              : typeof body.enabled === "boolean"
                ? body.enabled
                : existing.status === "active",
    });

    if (!normalized) {
      return json(400, { error: "invalid_bot_config" });
    }

    let manifest;
    try {
      manifest = strategyRegistry.getManifest(existing.strategyId);
    } catch {
      return json(400, { error: "unsupported_strategy" });
    }

    const resolvedStrategyConfig = toStrategyConfigRecord(
      manifest.resolveConfig(
        body.strategyConfig !== undefined
          ? toStrategyConfigRecord(body.strategyConfig)
          : toStrategyConfigRecord(
              existing.runtime.strategyConfig ?? existing.strategyConfig,
            ),
      ),
    );

    const status: BotRecord["status"] =
      requestedStatus ??
      (typeof body.enabled === "boolean"
        ? body.enabled
          ? "active"
          : "paused"
        : existing.status);

    const { enabled: _enabled, ...normalizedRuntime } = normalized;

    const updated: BotRecord = {
      ...toBotDefinition({
        ...normalized,
        strategyConfig: resolvedStrategyConfig,
      }),
      id: existing.id,
      name: normalizeNonEmptyString(body.name) ?? existing.name,
      status,
      createdAtMs: existing.createdAtMs,
      updatedAtMs: Date.now(),
      runtime: {
        ...normalizedRuntime,
        strategyConfig: resolvedStrategyConfig,
      },
    };

    await putBotRecord(updated);
    return json(200, {
      generatedAt: new Date().toISOString(),
      bot: updated,
    });
  } catch (error) {
    console.error("[bot-api] patch bot failed", { error });
    return json(500, { error: "failed_to_patch_bot" });
  }
}

export async function strategiesHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const windowHours = parsePositiveInt(
      event.queryStringParameters?.windowHours,
      DEFAULT_STATS_WINDOW_HOURS,
      MAX_STATS_WINDOW_HOURS,
    );
    const runsLimit = parsePositiveInt(
      event.queryStringParameters?.runsLimit,
      MAX_LIMIT,
      MAX_LIMIT,
    );
    const backtestLimit = parsePositiveInt(
      event.queryStringParameters?.backtestLimit,
      200,
      MAX_LIMIT,
    );

    const strategies = await loadStrategySummaries(
      windowHours,
      runsLimit,
      backtestLimit,
    );
    return json(200, {
      generatedAt: new Date().toISOString(),
      count: strategies.length,
      strategies,
    });
  } catch (error) {
    console.error("[strategy-api] strategies failed", { error });
    return json(500, { error: "failed_to_load_strategies" });
  }
}

export async function strategyDetailsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawStrategyId = event.pathParameters?.strategyId?.trim();
  if (!rawStrategyId) {
    return json(400, { error: "missing_strategy_id" });
  }

  try {
    const strategyId = decodeURIComponent(rawStrategyId);
    const windowHours = parsePositiveInt(
      event.queryStringParameters?.windowHours,
      DEFAULT_STATS_WINDOW_HOURS,
      MAX_STATS_WINDOW_HOURS,
    );
    const runsLimit = parsePositiveInt(
      event.queryStringParameters?.runsLimit,
      MAX_LIMIT,
      MAX_LIMIT,
    );
    const backtestLimit = parsePositiveInt(
      event.queryStringParameters?.backtestLimit,
      200,
      MAX_LIMIT,
    );

    const details = await loadStrategyDetails(
      strategyId,
      windowHours,
      runsLimit,
      backtestLimit,
    );

    if (!details) {
      return json(404, { error: "strategy_not_found" });
    }

    return json(200, details);
  } catch (error) {
    console.error("[strategy-api] strategy details failed", { error });
    return json(500, { error: "failed_to_load_strategy_details" });
  }
}

export async function botDetailsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawBotId = event.pathParameters?.botId?.trim();
  if (!rawBotId) {
    return json(400, { error: "missing_bot_id" });
  }

  try {
    const bot = await resolveBotById(decodeURIComponent(rawBotId));
    if (!bot) {
      return json(404, { error: "bot_not_found" });
    }

    const [latestRun, openPosition, recentBacktests, recentValidations] =
      await Promise.all([
        listLatestRunsByBotIds([bot.id]).then((runs) => runs[0]),
        getLatestOpenPositionByBot(bot.id),
        listRecentBacktestsByBotId(bot.id, 10),
        listRecentRangeValidationsByBotId(bot.id, 10),
      ]);

    const summary = buildBotSummaries([bot], latestRun ? [latestRun] : [])[0];

    return json(200, {
      generatedAt: new Date().toISOString(),
      bot,
      summary,
      openPosition,
      backtests: recentBacktests,
      validations: recentValidations,
    });
  } catch (error) {
    console.error("[bot-api] bot details failed", { error });
    return json(500, { error: "failed_to_load_bot_details" });
  }
}

export async function botPositionsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawBotId = event.pathParameters?.botId?.trim();
  if (!rawBotId) {
    return json(400, { error: "missing_bot_id" });
  }

  try {
    const botId = decodeURIComponent(rawBotId);
    const [positions, orders, fills, reconciliations] = await Promise.all([
      listPositionsByBot(botId, 50),
      listOrdersByBot(botId, 100),
      listFillsByBot(botId, 100),
      listReconciliationEventsByBot(botId, 100),
    ]);
    return json(200, {
      generatedAt: new Date().toISOString(),
      count: positions.length,
      positions,
      orders,
      fills,
      reconciliations,
    });
  } catch (error) {
    console.error("[bot-api] bot positions failed", { error });
    return json(500, { error: "failed_to_load_positions" });
  }
}

function latestIndicatorValues(
  outputs: Record<string, number[]>,
): Record<string, number> | undefined {
  const entries = Object.entries(outputs)
    .map(([key, values]) => {
      const latest = [...values].reverse().find((value) => Number.isFinite(value));
      return typeof latest === "number" ? ([key, latest] as const) : null;
    })
    .filter((entry): entry is readonly [string, number] => Boolean(entry));

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

export async function botIndicatorPoolHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawBotId = event.pathParameters?.botId?.trim();
  if (!rawBotId) {
    return json(400, { error: "missing_bot_id" });
  }

  try {
    const botId = decodeURIComponent(rawBotId);
    const bot = await resolveBotById(botId);
    if (!bot) {
      return json(404, { error: "bot_not_found" });
    }

    const resolved = strategyRegistry.get(bot);
    const requiredFeeds = resolved.manifest.requiredFeeds({
      bot,
      config: resolved.config,
    });

    const marketFeeds = await Promise.all(
      requiredFeeds.candles.map(async (requirement) => {
        const state = await getMarketFeedState({
          exchangeId: bot.exchangeId,
          symbol: bot.symbol,
          timeframe: requirement.timeframe,
        });

        return {
          role: requirement.role,
          timeframe: requirement.timeframe,
          lookbackBars: requirement.lookbackBars,
          status: state?.status ?? "stale",
          requiredByCount: state?.requiredByCount ?? 0,
          maxLookbackBars: state?.maxLookbackBars ?? requirement.lookbackBars,
          lastClosedCandleTime: state?.lastClosedCandleTime,
          lastRefreshedAt: state?.lastRefreshedAt,
          candleCount: state?.candleCount,
          errorMessage: state?.errorMessage,
        };
      }),
    );

    const indicatorFeeds = await Promise.all(
      requiredFeeds.indicators.map(async (requirement) => {
        const paramsHash = createIndicatorParamsHash({
          indicatorId: requirement.indicatorId,
          source: requirement.source,
          params: requirement.params,
        });
        const state = await getIndicatorFeedState({
          exchangeId: bot.exchangeId,
          symbol: bot.symbol,
          timeframe: requirement.timeframe,
          indicatorId: requirement.indicatorId,
          paramsHash,
        });
        const snapshot = state
          ? await loadLatestIndicatorFeedSnapshot({
              exchangeId: state.exchangeId,
              symbol: state.symbol,
              timeframe: state.timeframe,
              indicatorId: state.indicatorId,
              paramsHash: state.paramsHash,
            })
          : null;

        return {
          role: requirement.role,
          timeframe: requirement.timeframe,
          indicatorId: requirement.indicatorId,
          paramsHash,
          params: requirement.params,
          lookbackBars: requirement.lookbackBars,
          status: state?.status ?? "pending",
          requiredByCount: state?.requiredByCount ?? 0,
          maxLookbackBars: state?.maxLookbackBars ?? requirement.lookbackBars,
          lastComputedCandleTime:
            snapshot?.lastComputedCandleTime ?? state?.lastComputedCandleTime,
          lastComputedAt: state?.lastComputedAt,
          latestValues: snapshot
            ? latestIndicatorValues(snapshot.outputs)
            : undefined,
          errorMessage: state?.errorMessage,
        };
      }),
    );

    const payload: BotIndicatorPoolPayload = {
      generatedAt: new Date().toISOString(),
      botId: bot.id,
      strategyId: bot.strategyId,
      exchangeId: bot.exchangeId,
      symbol: bot.symbol,
      marketFeeds,
      indicatorFeeds,
    };

    return json(200, payload);
  } catch (error) {
    console.error("[bot-api] bot indicator pool failed", { error });
    return json(500, { error: "failed_to_load_indicator_pool" });
  }
}

export async function botStatsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const windowHours = parsePositiveInt(
      event.queryStringParameters?.windowHours,
      DEFAULT_STATS_WINDOW_HOURS,
      MAX_STATS_WINDOW_HOURS,
    );
    const runsLimit = parsePositiveInt(
      event.queryStringParameters?.runsLimit,
      MAX_LIMIT,
      MAX_LIMIT,
    );
    const backtestLimit = parsePositiveInt(
      event.queryStringParameters?.backtestLimit,
      200,
      MAX_LIMIT,
    );

    const bots = await syncConfiguredBots();
    const [runs, backtests, positionsByBot] = await Promise.all([
      listRecentRuns(runsLimit),
      listRecentBacktests(backtestLimit),
      Promise.all(bots.map((bot) => listPositionsByBot(bot.id, 20))),
    ]);

    const windowStartMs = Date.now() - windowHours * 60 * 60_000;
    const runsInWindow = runs.filter(
      (run) => run.generatedAtMs >= windowStartMs,
    );
    const profitableBacktests = backtests.filter(
      (backtest) => backtest.status === "completed" && backtest.netPnl > 0,
    ).length;
    const latestCompleted = backtests.find(
      (backtest) => backtest.status === "completed",
    );
    const operations = computeDashboardMetrics(runsInWindow);
    const flatPositions = positionsByBot.flat();

    const summary: BotStatsSummary = {
      generatedAt: new Date().toISOString(),
      bot: {
        configured: bots.length,
        active: bots.filter((bot) => bot.status === "active").length,
      },
      operations,
      strategy: {
        netPnl: backtests
          .filter((backtest) => backtest.status === "completed")
          .reduce((sum, backtest) => sum + backtest.netPnl, 0),
        grossProfit: backtests
          .filter((backtest) => backtest.status === "completed")
          .reduce((sum, backtest) => sum + backtest.grossProfit, 0),
        grossLoss: backtests
          .filter((backtest) => backtest.status === "completed")
          .reduce((sum, backtest) => sum + backtest.grossLoss, 0),
        winRate:
          backtests.length > 0
            ? backtests.reduce((sum, backtest) => sum + backtest.winRate, 0) /
              backtests.length
            : 0,
        totalTrades: backtests.reduce(
          (sum, backtest) => sum + backtest.totalTrades,
          0,
        ),
        profitableBacktests,
        latestNetPnl: latestCompleted?.netPnl,
        maxDrawdownPct: latestCompleted?.maxDrawdownPct,
      },
      positions: {
        openPositions: flatPositions.filter(
          (position) => position.status === "open",
        ).length,
        reducingPositions: flatPositions.filter(
          (position) => position.status === "reducing",
        ).length,
        closingPositions: flatPositions.filter(
          (position) => position.status === "closing",
        ).length,
        reconciliationsPending: flatPositions.filter(
          (position) => position.status === "reconciling",
        ).length,
        forcedCloseCount: 0,
        breakevenMoves: 0,
      },
      backtests: {
        total: backtests.length,
        running: backtests.filter((backtest) => backtest.status === "running")
          .length,
        completed: backtests.filter(
          (backtest) => backtest.status === "completed",
        ).length,
        failed: backtests.filter((backtest) => backtest.status === "failed")
          .length,
        profitable: profitableBacktests,
        latestNetPnl: latestCompleted?.netPnl,
      },
    };

    return json(200, summary);
  } catch (error) {
    console.error("[ranging-api] bot stats failed", { error });
    return json(500, {
      error: "failed_to_load_bot_stats",
    });
  }
}

export async function botDetailsStatsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawBotId = event.pathParameters?.botId?.trim();
  if (!rawBotId) {
    return json(400, { error: "missing_bot_id" });
  }

  try {
    const botId = decodeURIComponent(rawBotId);
    const bot = await resolveBotById(botId);
    if (!bot) {
      return json(404, { error: "bot_not_found" });
    }

    const windowHours = parsePositiveInt(
      event.queryStringParameters?.windowHours,
      DEFAULT_STATS_WINDOW_HOURS,
      MAX_STATS_WINDOW_HOURS,
    );
    const [runs, backtests, positions] = await Promise.all([
      listRecentRunsBySymbol(bot.symbol, MAX_LIMIT).then((all) =>
        all.filter((run) => run.botId === botId),
      ),
      listRecentBacktestsByBotId(botId, MAX_LIMIT),
      listPositionsByBot(botId, MAX_LIMIT),
    ]);

    const windowStartMs = Date.now() - windowHours * 60 * 60_000;
    const runsInWindow = runs.filter(
      (run) => run.generatedAtMs >= windowStartMs,
    );
    const operations = computeDashboardMetrics(runsInWindow);
    const latestCompleted = backtests.find(
      (backtest) => backtest.status === "completed",
    );

    const summary: BotStatsSummary = {
      generatedAt: new Date().toISOString(),
      bot: {
        configured: 1,
        active: bot.status === "active" ? 1 : 0,
      },
      operations,
      strategy: {
        netPnl: backtests
          .filter((backtest) => backtest.status === "completed")
          .reduce((sum, backtest) => sum + backtest.netPnl, 0),
        grossProfit: backtests
          .filter((backtest) => backtest.status === "completed")
          .reduce((sum, backtest) => sum + backtest.grossProfit, 0),
        grossLoss: backtests
          .filter((backtest) => backtest.status === "completed")
          .reduce((sum, backtest) => sum + backtest.grossLoss, 0),
        winRate:
          backtests.length > 0
            ? backtests.reduce((sum, backtest) => sum + backtest.winRate, 0) /
              backtests.length
            : 0,
        totalTrades: backtests.reduce(
          (sum, backtest) => sum + backtest.totalTrades,
          0,
        ),
        profitableBacktests: backtests.filter(
          (backtest) => backtest.status === "completed" && backtest.netPnl > 0,
        ).length,
        latestNetPnl: latestCompleted?.netPnl,
        maxDrawdownPct: latestCompleted?.maxDrawdownPct,
      },
      positions: {
        openPositions: positions.filter(
          (position) => position.status === "open",
        ).length,
        reducingPositions: positions.filter(
          (position) => position.status === "reducing",
        ).length,
        closingPositions: positions.filter(
          (position) => position.status === "closing",
        ).length,
        reconciliationsPending: positions.filter(
          (position) => position.status === "reconciling",
        ).length,
        forcedCloseCount: 0,
        breakevenMoves: 0,
      },
      backtests: {
        total: backtests.length,
        running: backtests.filter((backtest) => backtest.status === "running")
          .length,
        completed: backtests.filter(
          (backtest) => backtest.status === "completed",
        ).length,
        failed: backtests.filter((backtest) => backtest.status === "failed")
          .length,
        profitable: backtests.filter(
          (backtest) => backtest.status === "completed" && backtest.netPnl > 0,
        ).length,
        latestNetPnl: latestCompleted?.netPnl,
      },
    };

    return json(200, summary);
  } catch (error) {
    console.error("[bot-api] bot stats failed", { error });
    return json(500, { error: "failed_to_load_bot_stats" });
  }
}

interface CreateBacktestBody {
  symbol?: string;
  periodDays?: number;
  fromMs?: number;
  toMs?: number;
  initialEquity?: number;
  executionTimeframe?: string;
  primaryRangeTimeframe?: string;
  secondaryRangeTimeframe?: string;
  strategyConfig?: Record<string, unknown>;
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

interface CreateBotBody extends Partial<RuntimeBotConfig> {}

interface PatchBotBody extends Partial<RuntimeBotConfig> {
  status?: "active" | "paused" | "archived";
}

interface CreateAccountBody {
  name?: string;
  exchangeId?: string;
  auth?: {
    apiKey?: string;
    apiSecret?: string;
    apiPassphrase?: string;
  };
}

interface PatchAccountBody {
  status?: "active" | "paused" | "archived";
  auth?: {
    apiKey?: string;
    apiSecret?: string;
    apiPassphrase?: string;
  };
}

interface CreateValidationBody {
  symbol?: string;
  timeframe?: string;
  fromMs?: number;
  toMs?: number;
  candlesCount?: number;
  confidenceThreshold?: number;
}

function parseBacktestAiConfig(
  raw: CreateBacktestBody["ai"],
): BacktestAiConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
    return undefined;
  }
  const enabled = raw.enabled === true;
  const models = getValidationModels();
  const confidenceThreshold = parseConfidence(
    raw.confidenceThreshold,
    getRuntimeSettings().validationConfidenceThreshold ||
      DEFAULT_VALIDATION_CONFIDENCE_THRESHOLD,
  );

  const modelPrimary =
    typeof raw.modelPrimary === "string" && raw.modelPrimary.trim().length > 0
      ? raw.modelPrimary.trim()
      : models.primary;
  const modelFallback =
    typeof raw.modelFallback === "string" && raw.modelFallback.trim().length > 0
      ? raw.modelFallback.trim()
      : models.fallback;
  const lookbackCandles = parsePositiveInt(
    raw.lookbackCandles !== undefined ? String(raw.lookbackCandles) : undefined,
    DEFAULT_BACKTEST_AI_LOOKBACK_CANDLES,
    MAX_VALIDATION_CANDLE_COUNT,
  );
  const cadenceBars = parsePositiveInt(
    raw.cadenceBars !== undefined ? String(raw.cadenceBars) : undefined,
    DEFAULT_BACKTEST_AI_CADENCE_BARS,
    24,
  );
  const maxEvaluations = parsePositiveInt(
    raw.maxEvaluations !== undefined ? String(raw.maxEvaluations) : undefined,
    DEFAULT_BACKTEST_AI_MAX_EVALUATIONS,
    MAX_BACKTEST_AI_EVALUATIONS,
  );

  return {
    enabled,
    lookbackCandles,
    cadenceBars,
    maxEvaluations,
    confidenceThreshold,
    modelPrimary,
    modelFallback,
  };
}

async function enqueueBacktestForBot(
  bot: BotRecord,
  body: CreateBacktestBody,
): Promise<APIGatewayProxyResultV2> {
  let manifest;
  try {
    manifest = strategyRegistry.getManifest(bot.strategyId);
  } catch {
    return json(400, { error: "unsupported_strategy" });
  }

  const defaults = getBotDefaults(bot);
  const nowMs = Date.now();
  const toMs =
    typeof body.toMs === "number" && Number.isFinite(body.toMs) && body.toMs > 0
      ? Math.floor(body.toMs)
      : nowMs;
  const periodDays =
    typeof body.periodDays === "number" && Number.isFinite(body.periodDays)
      ? Math.max(
          1,
          Math.min(Math.floor(body.periodDays), MAX_BACKTEST_PERIOD_DAYS),
        )
      : DEFAULT_BACKTEST_PERIOD_DAYS;
  const fromMs =
    typeof body.fromMs === "number" &&
    Number.isFinite(body.fromMs) &&
    body.fromMs > 0
      ? Math.floor(body.fromMs)
      : toMs - periodDays * 24 * 60 * 60_000;

  if (fromMs >= toMs) {
    return json(400, { error: "invalid_time_window" });
  }

  const executionTimeframe = isTimeframe(body.executionTimeframe)
    ? body.executionTimeframe
    : defaults.executionTimeframe;
  const primaryRangeTimeframe = isTimeframe(body.primaryRangeTimeframe)
    ? body.primaryRangeTimeframe
    : defaults.primaryRangeTimeframe;
  const secondaryRangeTimeframe = isTimeframe(body.secondaryRangeTimeframe)
    ? body.secondaryRangeTimeframe
    : defaults.secondaryRangeTimeframe;
  const initialEquity = normalizePositiveNumber(
    body.initialEquity,
    1_000,
    100_000_000,
  );
  const aiConfig = parseBacktestAiConfig(body.ai);
  if (body.ai !== undefined && !aiConfig) {
    return json(400, { error: "invalid_ai_config" });
  }

  const defaultStrategyConfig = toStrategyConfigRecord(
    manifest.getDefaultConfig(),
  );
  const botEffectiveStrategyConfig = mergeStrategyConfigDefaults(
    defaultStrategyConfig,
    toStrategyConfigRecord(bot.runtime.strategyConfig ?? bot.strategyConfig),
  );
  const requestedStrategyConfig =
    body.strategyConfig !== undefined
      ? mergeStrategyConfigDefaults(
          botEffectiveStrategyConfig,
          toStrategyConfigRecord(body.strategyConfig),
        )
      : botEffectiveStrategyConfig;

  let resolvedStrategyConfig: Record<string, unknown>;
  try {
    resolvedStrategyConfig = toStrategyConfigRecord(
      manifest.resolveConfig(requestedStrategyConfig),
    );
  } catch (error) {
    return json(400, {
      error: "invalid_strategy_config",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const input: Omit<BacktestRequestedDetail, "backtestId" | "createdAtMs"> = {
    botId: bot.id,
    botName: bot.name,
    strategyId: bot.strategyId,
    strategyVersion: bot.strategyVersion,
    exchangeId: bot.exchangeId,
    accountId: bot.accountId,
    symbol: bot.symbol,
    strategyConfig: resolvedStrategyConfig,
    fromMs,
    toMs,
    executionTimeframe,
    primaryRangeTimeframe,
    secondaryRangeTimeframe,
    initialEquity,
    ai: aiConfig,
  };

  const identity = createBacktestIdentity(bot.symbol);
  const backtest = createRunningBacktestRecord(input, identity);

  try {
    await putBacktestRecord(backtest);
  } catch (error) {
    console.error("[ranging-api] failed to create queued backtest record", {
      botId: bot.id,
      symbol: bot.symbol,
      backtestId: backtest.id,
      error,
    });
    const details = error instanceof Error ? error.message : String(error);
    return json(500, {
      error: "failed_to_create_backtest_record",
      details,
    });
  }

  const detail: BacktestRequestedDetail = {
    ...input,
    backtestId: identity.backtestId,
    createdAtMs: identity.createdAtMs,
  };

  try {
    await publishBacktestRequested(detail);
  } catch (queueError) {
    const queueMessage =
      queueError instanceof Error ? queueError.message : String(queueError);
    const failedRecord = createFailedBacktestRecord(
      input,
      identity,
      `Failed to enqueue backtest: ${queueMessage}`,
    );

    try {
      await putBacktestRecord(failedRecord);
    } catch (storeError) {
      console.error("[ranging-api] failed to persist enqueue failure state", {
        botId: bot.id,
        symbol: bot.symbol,
        backtestId: identity.backtestId,
        queueError,
        storeError,
      });
    }

    return json(500, {
      error: "failed_to_enqueue_backtest",
      details: queueMessage,
      backtest: failedRecord,
    });
  }

  return json(202, {
    generatedAt: new Date().toISOString(),
    backtest,
  });
}

export async function createBacktestHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = parseJsonBody<CreateBacktestBody>(event);
    if (!body) {
      return json(400, { error: "invalid_json_body" });
    }

    const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
    if (!symbol) {
      return json(400, { error: "missing_symbol" });
    }
    const bot = await resolveBotBySymbol(symbol);
    if (!bot) {
      return json(404, { error: "bot_not_found_for_symbol" });
    }

    return enqueueBacktestForBot(bot, body);
  } catch (error) {
    console.error("[ranging-api] create backtest failed", { error });
    const details = error instanceof Error ? error.message : String(error);
    return json(500, {
      error: "failed_to_create_backtest",
      details,
    });
  }
}

export async function createBotBacktestHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const rawBotId = event.pathParameters?.botId?.trim();
    if (!rawBotId) {
      return json(400, { error: "missing_bot_id" });
    }

    const body = parseJsonBody<CreateBacktestBody>(event);
    if (!body) {
      return json(400, { error: "invalid_json_body" });
    }

    const bot = await resolveBotById(decodeURIComponent(rawBotId));
    if (!bot) {
      return json(404, { error: "bot_not_found" });
    }

    return enqueueBacktestForBot(bot, body);
  } catch (error) {
    console.error("[bot-api] create bot backtest failed", { error });
    const details = error instanceof Error ? error.message : String(error);
    return json(500, {
      error: "failed_to_create_backtest",
      details,
    });
  }
}

function getValidationModels(): { primary: string; fallback: string } {
  const runtimeSettings = getRuntimeSettings();

  return {
    primary:
      runtimeSettings.validationModelPrimary ||
      DEFAULT_VALIDATION_MODEL_PRIMARY,
    fallback:
      runtimeSettings.validationModelFallback ||
      DEFAULT_VALIDATION_MODEL_FALLBACK,
  };
}

async function enqueueValidationForBot(
  bot: BotRecord,
  body: CreateValidationBody,
): Promise<APIGatewayProxyResultV2> {
  const defaults = getBotDefaults(bot);
  const timeframe = isTimeframe(body.timeframe)
    ? body.timeframe
    : defaults.executionTimeframe || DEFAULT_VALIDATION_TIMEFRAME;
  const candleCount = parsePositiveInt(
    typeof body.candlesCount === "number"
      ? String(body.candlesCount)
      : undefined,
    DEFAULT_VALIDATION_CANDLE_COUNT,
    MAX_VALIDATION_CANDLE_COUNT,
  );

  const nowMs = Date.now();
  const toMs =
    typeof body.toMs === "number" && Number.isFinite(body.toMs) && body.toMs > 0
      ? Math.floor(body.toMs)
      : nowMs;
  const fromMs =
    typeof body.fromMs === "number" &&
    Number.isFinite(body.fromMs) &&
    body.fromMs > 0
      ? Math.floor(body.fromMs)
      : toMs - candleCount * timeframeDurationMs(timeframe);

  if (fromMs >= toMs) {
    return json(400, { error: "invalid_time_window" });
  }

  const models = getValidationModels();
  const confidenceThreshold = parseConfidence(
    body.confidenceThreshold,
    getRuntimeSettings().validationConfidenceThreshold ||
      DEFAULT_VALIDATION_CONFIDENCE_THRESHOLD,
  );

  const identity = createValidationIdentity(bot.symbol);
  const validation = createPendingValidationRecord(
    {
      botId: bot.id,
      botName: bot.name,
      strategyId: bot.strategyId,
      symbol: bot.symbol,
      timeframe,
      fromMs,
      toMs,
      candlesCount: candleCount,
      modelPrimary: models.primary,
      modelFallback: models.fallback,
      confidenceThreshold,
    },
    identity,
  );

  try {
    await putRangeValidationRecord(validation);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("[ranging-api] failed to create validation record", {
      botId: bot.id,
      symbol: bot.symbol,
      validationId: validation.id,
      error,
    });
    return json(500, {
      error: "failed_to_create_validation_record",
      details,
    });
  }

  const detail: RangeValidationRequestedDetail = {
    validationId: identity.validationId,
    createdAtMs: identity.createdAtMs,
    botId: bot.id,
    botName: bot.name,
    strategyId: bot.strategyId,
    symbol: bot.symbol,
    timeframe,
    fromMs,
    toMs,
    candlesCount: candleCount,
  };

  try {
    await publishRangeValidationRequested(detail);
  } catch (queueError) {
    const queueMessage =
      queueError instanceof Error ? queueError.message : String(queueError);
    const failedRecord = createFailedValidationRecord(
      validation,
      `Failed to enqueue validation: ${queueMessage}`,
    );

    try {
      await putRangeValidationRecord(failedRecord);
    } catch (storeError) {
      console.error(
        "[ranging-api] failed to persist validation enqueue failure",
        {
          botId: bot.id,
          symbol: bot.symbol,
          validationId: validation.id,
          queueError,
          storeError,
        },
      );
    }

    return json(500, {
      error: "failed_to_enqueue_validation",
      details: queueMessage,
      validation: failedRecord,
    });
  }

  return json(202, {
    generatedAt: new Date().toISOString(),
    validation,
  });
}

export async function createRangeValidationHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = parseJsonBody<CreateValidationBody>(event);
    if (!body) {
      return json(400, { error: "invalid_json_body" });
    }

    const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
    if (!symbol) {
      return json(400, { error: "missing_symbol" });
    }
    const bot = await resolveBotBySymbol(symbol);
    if (!bot) {
      return json(404, { error: "bot_not_found_for_symbol" });
    }
    return enqueueValidationForBot(bot, body);
  } catch (error) {
    console.error("[ranging-api] create validation failed", { error });
    const details = error instanceof Error ? error.message : String(error);
    return json(500, {
      error: "failed_to_create_validation",
      details,
    });
  }
}

export async function createBotRangeValidationHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const rawBotId = event.pathParameters?.botId?.trim();
    if (!rawBotId) {
      return json(400, { error: "missing_bot_id" });
    }

    const body = parseJsonBody<CreateValidationBody>(event);
    if (!body) {
      return json(400, { error: "invalid_json_body" });
    }

    const bot = await resolveBotById(decodeURIComponent(rawBotId));
    if (!bot) {
      return json(404, { error: "bot_not_found" });
    }

    return enqueueValidationForBot(bot, body);
  } catch (error) {
    console.error("[bot-api] create bot validation failed", { error });
    const details = error instanceof Error ? error.message : String(error);
    return json(500, {
      error: "failed_to_create_validation",
      details,
    });
  }
}

export async function rangeValidationsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const limit = parseLimit(event.queryStringParameters?.limit);
    const botId = event.queryStringParameters?.botId?.trim();
    const symbol = event.queryStringParameters?.symbol?.trim();

    const validations = botId
      ? await listRecentRangeValidationsByBotId(botId, limit)
      : symbol
        ? await listRecentRangeValidationsBySymbol(symbol, limit)
        : await listRecentRangeValidations(limit);

    return json(200, {
      generatedAt: new Date().toISOString(),
      count: validations.length,
      validations,
    });
  } catch (error) {
    console.error("[ranging-api] range validations failed", { error });
    return json(500, {
      error: "failed_to_load_range_validations",
    });
  }
}

export async function botRangeValidationsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawBotId = event.pathParameters?.botId?.trim();
  if (!rawBotId) {
    return json(400, { error: "missing_bot_id" });
  }

  try {
    const limit = parseLimit(event.queryStringParameters?.limit);
    const validations = await listRecentRangeValidationsByBotId(
      decodeURIComponent(rawBotId),
      limit,
    );

    return json(200, {
      generatedAt: new Date().toISOString(),
      count: validations.length,
      validations,
    });
  } catch (error) {
    console.error("[bot-api] bot validations failed", { error });
    return json(500, {
      error: "failed_to_load_range_validations",
    });
  }
}

export async function rangeValidationDetailsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const rawValidationId = event.pathParameters?.id?.trim();
    if (!rawValidationId) {
      return json(400, { error: "missing_validation_id" });
    }

    const validationId = decodeURIComponent(rawValidationId);
    const validation = await getRangeValidationById(validationId);
    if (!validation) {
      return json(404, {
        error: "range_validation_not_found",
      });
    }

    return json(200, {
      generatedAt: new Date().toISOString(),
      validation,
    });
  } catch (error) {
    console.error("[ranging-api] range validation details failed", { error });
    return json(500, {
      error: "failed_to_load_range_validation_details",
    });
  }
}

export async function backtestsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const limit = parseLimit(event.queryStringParameters?.limit);
    const botId = event.queryStringParameters?.botId?.trim();
    const symbol = event.queryStringParameters?.symbol?.trim();

    const backtests = botId
      ? await listRecentBacktestsByBotId(botId, limit)
      : symbol
        ? await listRecentBacktestsBySymbol(symbol, limit)
        : await listRecentBacktests(limit);
    const normalizedBacktests = await markStaleBacktests(backtests);

    return json(200, {
      generatedAt: new Date().toISOString(),
      count: normalizedBacktests.length,
      backtests: normalizedBacktests,
    });
  } catch (error) {
    console.error("[ranging-api] backtests failed", { error });
    return json(500, {
      error: "failed_to_load_backtests",
    });
  }
}

export async function botBacktestsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawBotId = event.pathParameters?.botId?.trim();
  if (!rawBotId) {
    return json(400, { error: "missing_bot_id" });
  }

  try {
    const limit = parseLimit(event.queryStringParameters?.limit);
    const backtests = await listRecentBacktestsByBotId(
      decodeURIComponent(rawBotId),
      limit,
    );
    const normalizedBacktests = await markStaleBacktests(backtests);

    return json(200, {
      generatedAt: new Date().toISOString(),
      count: normalizedBacktests.length,
      backtests: normalizedBacktests,
    });
  } catch (error) {
    console.error("[bot-api] bot backtests failed", { error });
    return json(500, {
      error: "failed_to_load_backtests",
    });
  }
}

async function loadBacktestDetails(
  backtestId: string,
  timeframeInput: string | undefined,
): Promise<APIGatewayProxyResultV2> {
  try {
    let backtest = await getBacktestById(backtestId);
    if (!backtest) {
      return json(404, { error: "backtest_not_found" });
    }

    if (backtest.status === "running" && isStaleRunningBacktest(backtest)) {
      try {
        backtest = await markBacktestAsFailed(
          backtest,
          "Backtest timed out while running. Retry with lower AI max calls or wider cadence.",
        );
      } catch (error) {
        console.error(
          "[ranging-api] failed to mark stale backtest in details",
          {
            backtestId: backtest.id,
            symbol: backtest.symbol,
            error,
          },
        );
      }
    }

    const chartTimeframe = isBacktestChartTimeframe(timeframeInput)
      ? timeframeInput
      : DEFAULT_BACKTEST_CHART_TIMEFRAME;

    if (backtest.status !== "completed") {
      const replayError =
        backtest.status === "running"
          ? "Backtest is still running. It will appear in the list shortly."
          : backtest.errorMessage;

      return json(200, {
        generatedAt: new Date().toISOString(),
        backtest,
        chartTimeframe,
        candles: [],
        trades: [],
        equityCurve: [],
        replayError,
      });
    }

    let candles: Candle[] = [];
    let candlesRef: KlineCacheReference | undefined;
    let trades: BacktestTradeView[] = [];
    let equityCurve: EquityPoint[] = [];
    let replayError: string | undefined;

    try {
      const replay = await replayBacktestRecord(backtest, chartTimeframe);
      candles = replay.chartCandlesRef ? [] : replay.chartCandles;
      candlesRef = replay.chartCandlesRef;
      trades = replay.trades;
      equityCurve = replay.result.equityCurve;
      backtest = await persistBacktestRefsIfNeeded(backtest, replay.klineRefs);
    } catch (error) {
      replayError = error instanceof Error ? error.message : String(error);
      console.error("[ranging-api] backtest replay failed", {
        backtestId: backtest.id,
        symbol: backtest.symbol,
        chartTimeframe,
        error,
      });
    }

    return json(200, {
      generatedAt: new Date().toISOString(),
      backtest,
      chartTimeframe,
      candles,
      candlesRef,
      trades,
      equityCurve,
      replayError,
    });
  } catch (error) {
    console.error("[ranging-api] backtest details failed", { error });
    const details = error instanceof Error ? error.message : String(error);
    return json(500, {
      error: "failed_to_load_backtest_details",
      details,
    });
  }
}

export async function backtestDetailsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawBacktestId = event.pathParameters?.id?.trim();
  if (!rawBacktestId) {
    return json(400, { error: "missing_backtest_id" });
  }

  const backtestId = decodeURIComponent(rawBacktestId);
  return loadBacktestDetails(
    backtestId,
    event.queryStringParameters?.chartTimeframe?.trim(),
  );
}

export async function deleteBacktestHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const rawBacktestId = event.pathParameters?.id?.trim();
  if (!rawBacktestId) {
    return json(400, { error: "missing_backtest_id" });
  }

  const backtestId = decodeURIComponent(rawBacktestId);

  try {
    const backtest = await getBacktestById(backtestId);
    if (!backtest) {
      return json(404, { error: "backtest_not_found" });
    }

    if (backtest.status === "running") {
      return json(409, {
        error: "backtest_running",
        details: "Running backtests cannot be removed.",
      });
    }

    await deleteBacktestRecord(backtestId);
    return json(200, {
      generatedAt: new Date().toISOString(),
      deleted: true,
      backtestId,
    });
  } catch (error) {
    console.error("[ranging-api] delete backtest failed", {
      backtestId,
      error,
    });
    return json(500, {
      error: "failed_to_delete_backtest",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function tradeDetailsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const rawTradeId = event.pathParameters?.id?.trim();
    if (!rawTradeId) {
      return json(400, { error: "missing_trade_id" });
    }

    const tradeId = decodeURIComponent(rawTradeId);
    const parsedTradeId = decodeTradeId(tradeId);
    if (!parsedTradeId) {
      return json(400, { error: "invalid_trade_id" });
    }

    const run = await getRunBySymbolAndTime(
      parsedTradeId.symbol,
      parsedTradeId.generatedAtMs,
    );

    if (!run) {
      return json(404, { error: "trade_not_found" });
    }

    const timeframeInput = event.queryStringParameters?.timeframe?.trim();
    const timeframe = isTimeframe(timeframeInput)
      ? timeframeInput
      : run.executionTimeframe;
    const barsBefore = parsePositiveInt(
      event.queryStringParameters?.barsBefore,
      DEFAULT_BARS_BEFORE,
      MAX_BARS_CONTEXT,
    );
    const barsAfter = parsePositiveInt(
      event.queryStringParameters?.barsAfter,
      DEFAULT_BARS_AFTER,
      MAX_BARS_CONTEXT,
    );

    const frameMs = timeframeMs[timeframe];
    const fromMs = run.generatedAtMs - barsBefore * frameMs;
    const toMs = run.generatedAtMs + barsAfter * frameMs;

    const klines = await fetchTradeContextKlines({
      symbol: run.symbol,
      timeframe,
      fromMs,
      toMs,
    });

    const trade = mapRunsToTrades([run])[0];
    if (!trade) {
      return json(500, { error: "failed_to_map_trade" });
    }

    return json(200, {
      generatedAt: new Date().toISOString(),
      trade,
      run,
      timeframe,
      barsBefore,
      barsAfter,
      klines,
    });
  } catch (error) {
    console.error("[ranging-api] trade details failed", { error });
    return json(500, {
      error: "failed_to_load_trade_details",
    });
  }
}
