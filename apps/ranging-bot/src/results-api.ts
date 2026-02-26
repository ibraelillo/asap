import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type { Candle, EquityPoint } from "@repo/ranging-core";
import { buildBotSummaries, computeDashboardMetrics, mapRunsToTrades } from "./monitoring/analytics";
import { replayBacktestRecord, runBacktestJob } from "./monitoring/backtests";
import {
  getBacktestById,
  getRunBySymbolAndTime,
  listRecentBacktests,
  listRecentBacktestsBySymbol,
  listLatestRunsBySymbols,
  listRecentRuns,
  listRecentRunsBySymbol,
  putBacktestRecord,
} from "./monitoring/store";
import type {
  BacktestRecord,
  BacktestTradeView,
  BotStatsSummary,
  BotRunRecord,
  DashboardPayload,
  KlineCacheReference,
  TradeSignalRecord,
} from "./monitoring/types";
import { fetchTradeContextKlines } from "./monitoring/kucoin-public-klines";
import { decodeTradeId } from "./monitoring/trades";
import { parseBotConfigs } from "./runtime-config";
import type { OrchestratorTimeframe } from "./contracts";

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
const DEMO_TRADE_ID = "demo";

const DEMO_RUN: BotRunRecord = {
  symbol: "BTCUSDTM",
  generatedAtMs: Date.UTC(2026, 1, 20, 12, 0, 0),
  recordedAtMs: Date.UTC(2026, 1, 20, 12, 0, 5),
  runStatus: "ok",
  executionTimeframe: "15m",
  primaryRangeTimeframe: "1d",
  secondaryRangeTimeframe: "4h",
  signal: "long",
  reasons: [
    "demo_trade_for_ui_validation",
    "bullish_divergence_confirmed",
    "bullish_sfp_confirmed",
  ],
  price: 96_420,
  rangeVal: 95_600,
  rangePoc: 97_150,
  rangeVah: 98_200,
  rangeIsAligned: true,
  rangeOverlapRatio: 0.81,
  bullishDivergence: true,
  bearishDivergence: false,
  bullishSfp: true,
  bearishSfp: false,
  moneyFlowSlope: 0.12,
  processing: {
    status: "order-submitted",
    side: "long",
    message: "demo-order-submitted",
    orderId: "DEMO-ORDER-0001",
    clientOid: "demo-client-0001",
  },
};

const DEMO_TRADE: TradeSignalRecord = {
  id: DEMO_TRADE_ID,
  symbol: DEMO_RUN.symbol,
  side: "long",
  generatedAtMs: DEMO_RUN.generatedAtMs,
  price: DEMO_RUN.price,
  processingStatus: DEMO_RUN.processing.status,
  orderId: DEMO_RUN.processing.orderId,
  clientOid: DEMO_RUN.processing.clientOid,
  reasons: DEMO_RUN.reasons,
};

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

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseSymbols(raw: string | undefined): string[] {
  if (!raw) return [];

  return [...new Set(raw
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0))];
}

function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizePositiveNumber(raw: unknown, fallback: number, max: number): number {
  if (raw === undefined || raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function isTimeframe(value: string | undefined): value is OrchestratorTimeframe {
  return Boolean(value && value in timeframeMs);
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

function getConfiguredSymbols(): string[] {
  const fromConfig = parseBotConfigs(process.env.RANGING_BOTS_JSON)
    .map((config) => config.symbol)
    .filter((symbol): symbol is string => symbol.length > 0);

  return [...new Set(fromConfig)];
}

function getBotDefaults(symbol: string): {
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
} {
  const all = parseBotConfigs(process.env.RANGING_BOTS_JSON);
  const match = all.find((config) => config.symbol === symbol);
  if (match) {
    return {
      executionTimeframe: match.executionTimeframe,
      primaryRangeTimeframe: match.primaryRangeTimeframe,
      secondaryRangeTimeframe: match.secondaryRangeTimeframe,
    };
  }

  return {
    executionTimeframe: "15m",
    primaryRangeTimeframe: "1d",
    secondaryRangeTimeframe: "4h",
  };
}

function buildDemoKlines(
  timeframe: OrchestratorTimeframe,
  barsBefore: number,
  barsAfter: number,
) {
  const frameMs = timeframeMs[timeframe];
  const candles: Candle[] = [];
  const totalBars = barsBefore + barsAfter + 1;
  const startMs = DEMO_RUN.generatedAtMs - barsBefore * frameMs;
  const basePrice = DEMO_RUN.rangePoc ?? DEMO_RUN.price ?? 1;
  let previousClose = basePrice - 120;

  for (let index = 0; index < totalBars; index += 1) {
    const time = startMs + index * frameMs;
    const drift = (index - barsBefore) * 3;
    const wave = Math.sin(index / 3) * 45;
    let close = basePrice + drift + wave;
    let open = previousClose;
    let high = Math.max(open, close) + 24 + (index % 5);
    let low = Math.min(open, close) - 24 - (index % 4);

    if (index === barsBefore) {
      close = DEMO_RUN.price ?? close;
      open = close - 22;
      high = close + 38;
      low = close - 54;
    }

    candles.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 180 + (index % 9) * 17,
    });

    previousClose = close;
  }

  return candles;
}

async function loadDashboard(limit: number, symbols?: string[]): Promise<DashboardPayload> {
  const recentRuns = await listRecentRuns(limit);
  const configuredSymbols = symbols && symbols.length > 0 ? symbols : getConfiguredSymbols();

  const latestRunsBySymbol =
    configuredSymbols.length > 0
      ? await listLatestRunsBySymbols(configuredSymbols)
      : [];

  const mappedTrades = mapRunsToTrades(recentRuns);
  const trades = mappedTrades.length > 0 ? mappedTrades : [DEMO_TRADE];

  return {
    generatedAt: new Date().toISOString(),
    metrics: computeDashboardMetrics(recentRuns),
    bots: buildBotSummaries(configuredSymbols, latestRunsBySymbol),
    recentRuns,
    trades,
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
    const symbols = parseSymbols(event.queryStringParameters?.symbols);
    const payload = await loadDashboard(limit, symbols);
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
    const symbol = event.queryStringParameters?.symbol?.trim();

    const runs = symbol
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

export async function botsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const symbols = parseSymbols(event.queryStringParameters?.symbols);
    const selectedSymbols = symbols.length > 0 ? symbols : getConfiguredSymbols();
    const latestRuns =
      selectedSymbols.length > 0
        ? await listLatestRunsBySymbols(selectedSymbols)
        : [];

    const bots = buildBotSummaries(selectedSymbols, latestRuns);

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

    const [runs, backtests] = await Promise.all([
      listRecentRuns(runsLimit),
      listRecentBacktests(backtestLimit),
    ]);

    const windowStartMs = Date.now() - windowHours * 60 * 60_000;
    const runsInWindow = runs.filter((run) => run.generatedAtMs >= windowStartMs);
    const signalsInWindow = runsInWindow.filter((run) => run.signal !== null).length;
    const failuresInWindow = runsInWindow.filter(
      (run) => run.runStatus === "failed" || run.processing.status === "error",
    ).length;
    const profitableBacktests = backtests.filter(
      (backtest) => backtest.status === "completed" && backtest.netPnl > 0,
    ).length;
    const latestCompleted = backtests.find((backtest) => backtest.status === "completed");

    const summary: BotStatsSummary = {
      generatedAt: new Date().toISOString(),
      configuredBots: getConfiguredSymbols().length,
      runsInWindow: runsInWindow.length,
      signalsInWindow,
      failuresInWindow,
      signalRate: runsInWindow.length > 0 ? signalsInWindow / runsInWindow.length : 0,
      failureRate: runsInWindow.length > 0 ? failuresInWindow / runsInWindow.length : 0,
      backtests: {
        total: backtests.length,
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

interface CreateBacktestBody {
  symbol?: string;
  periodDays?: number;
  fromMs?: number;
  toMs?: number;
  initialEquity?: number;
  executionTimeframe?: string;
  primaryRangeTimeframe?: string;
  secondaryRangeTimeframe?: string;
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

    const defaults = getBotDefaults(symbol);
    const nowMs = Date.now();
    const toMs =
      typeof body.toMs === "number" && Number.isFinite(body.toMs) && body.toMs > 0
        ? Math.floor(body.toMs)
        : nowMs;
    const periodDays =
      typeof body.periodDays === "number" && Number.isFinite(body.periodDays)
        ? Math.max(1, Math.min(Math.floor(body.periodDays), MAX_BACKTEST_PERIOD_DAYS))
        : DEFAULT_BACKTEST_PERIOD_DAYS;
    const fromMs =
      typeof body.fromMs === "number" && Number.isFinite(body.fromMs) && body.fromMs > 0
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

    const backtest = await runBacktestJob({
      symbol,
      fromMs,
      toMs,
      executionTimeframe,
      primaryRangeTimeframe,
      secondaryRangeTimeframe,
      initialEquity,
    });

    let storageWarning: string | undefined;
    try {
      await putBacktestRecord(backtest);
    } catch (storeError) {
      storageWarning =
        storeError instanceof Error
          ? storeError.message
          : String(storeError);
      console.error("[ranging-api] backtest persistence failed", {
        symbol,
        backtestId: backtest.id,
        error: storeError,
      });
    }

    return json(201, {
      generatedAt: new Date().toISOString(),
      backtest,
      storageWarning,
    });
  } catch (error) {
    console.error("[ranging-api] create backtest failed", { error });
    const details = error instanceof Error ? error.message : String(error);
    return json(500, {
      error: "failed_to_create_backtest",
      details,
    });
  }
}

export async function backtestsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const limit = parseLimit(event.queryStringParameters?.limit);
    const symbol = event.queryStringParameters?.symbol?.trim();

    const backtests = symbol
      ? await listRecentBacktestsBySymbol(symbol, limit)
      : await listRecentBacktests(limit);

    return json(200, {
      generatedAt: new Date().toISOString(),
      count: backtests.length,
      backtests,
    });
  } catch (error) {
    console.error("[ranging-api] backtests failed", { error });
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

    const chartTimeframe = isBacktestChartTimeframe(timeframeInput)
      ? timeframeInput
      : DEFAULT_BACKTEST_CHART_TIMEFRAME;

    if (backtest.status === "failed") {
      return json(200, {
        generatedAt: new Date().toISOString(),
        backtest,
        chartTimeframe,
        candles: [],
        trades: [],
        equityCurve: [],
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
      replayError =
        error instanceof Error ? error.message : String(error);
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

export async function tradeDetailsHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const rawTradeId = event.pathParameters?.id?.trim();
    if (!rawTradeId) {
      return json(400, { error: "missing_trade_id" });
    }

    const tradeId = decodeURIComponent(rawTradeId);
    if (tradeId === DEMO_TRADE_ID) {
      const timeframeInput = event.queryStringParameters?.timeframe?.trim();
      const timeframe = isTimeframe(timeframeInput)
        ? timeframeInput
        : DEMO_RUN.executionTimeframe;
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

      return json(200, {
        generatedAt: new Date().toISOString(),
        trade: DEMO_TRADE,
        run: DEMO_RUN,
        timeframe,
        barsBefore,
        barsAfter,
        klines: buildDemoKlines(timeframe, barsBefore, barsAfter),
      });
    }

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
