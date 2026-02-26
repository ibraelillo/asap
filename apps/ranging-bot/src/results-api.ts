import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type { Candle } from "@repo/ranging-core";
import { buildBotSummaries, computeDashboardMetrics, mapRunsToTrades } from "./monitoring/analytics";
import {
  getRunBySymbolAndTime,
  listLatestRunsBySymbols,
  listRecentRuns,
  listRecentRunsBySymbol,
} from "./monitoring/store";
import type {
  BotRunRecord,
  DashboardPayload,
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

function isTimeframe(value: string | undefined): value is OrchestratorTimeframe {
  return Boolean(value && value in timeframeMs);
}

function getConfiguredSymbols(): string[] {
  const fromConfig = parseBotConfigs(process.env.RANGING_BOTS_JSON)
    .map((config) => config.symbol)
    .filter((symbol): symbol is string => symbol.length > 0);

  return [...new Set(fromConfig)];
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
