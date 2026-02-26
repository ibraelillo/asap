import {
  createRangingBot,
  type BacktestTrade,
  type BacktestResult,
  type Candle,
  type DeepPartial,
  type RangeReversalConfig,
} from "@repo/ranging-core";
import type { OrchestratorTimeframe } from "../contracts";
import { fetchHistoricalKlines } from "./kucoin-public-klines";
import {
  buildWindowKlineCacheKey,
  findMatchingKlineRef,
  loadCandlesFromCacheKey,
  loadCandlesFromCacheRef,
  normalizeKlineReference,
  saveBacktestKlineCache,
} from "./kline-cache";
import type {
  BacktestRecord,
  BacktestTradeView,
  KlineCacheReference,
} from "./types";

export interface CreateBacktestInput {
  symbol: string;
  fromMs: number;
  toMs: number;
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
  initialEquity: number;
  strategyConfig?: DeepPartial<RangeReversalConfig>;
}

function newBacktestId(symbol: string, createdAtMs: number): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

  return `${symbol}-${createdAtMs}-${suffix}`;
}

function toFailedRecord(
  input: CreateBacktestInput,
  backtestId: string,
  createdAtMs: number,
  errorMessage: string,
): BacktestRecord {
  return {
    id: backtestId,
    createdAtMs,
    status: "failed",
    symbol: input.symbol,
    fromMs: input.fromMs,
    toMs: input.toMs,
    executionTimeframe: input.executionTimeframe,
    primaryRangeTimeframe: input.primaryRangeTimeframe,
    secondaryRangeTimeframe: input.secondaryRangeTimeframe,
    initialEquity: input.initialEquity,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    netPnl: 0,
    grossProfit: 0,
    grossLoss: 0,
    maxDrawdownPct: 0,
    endingEquity: input.initialEquity,
    errorMessage,
  };
}

interface BacktestComputationCandles {
  executionCandles: Candle[];
  primaryRangeCandles: Candle[];
  secondaryRangeCandles: Candle[];
  klineRefs: KlineCacheReference[];
}

interface CandleResolution {
  candles: Candle[];
  ref?: KlineCacheReference;
}

interface ResolveCandlesInput {
  backtestId: string;
  symbol: string;
  timeframe: OrchestratorTimeframe;
  fromMs: number;
  toMs: number;
  refs?: KlineCacheReference[];
}

function dedupeRefs(refs: Array<KlineCacheReference | undefined>): KlineCacheReference[] {
  const byKey = new Map<string, KlineCacheReference>();

  for (const ref of refs) {
    if (!ref) continue;
    const normalized = normalizeKlineReference(ref);
    const identity = normalized.key;
    if (!identity) continue;
    byKey.set(identity, normalized);
  }

  return [...byKey.values()];
}

async function resolveCandles(input: ResolveCandlesInput): Promise<CandleResolution> {
  const existing = findMatchingKlineRef(
    input.refs,
    input.symbol,
    input.timeframe,
    input.fromMs,
    input.toMs,
  );

  if (existing) {
    const cached = await loadCandlesFromCacheRef(existing);
    if (cached && cached.length > 0) {
      return {
        candles: cached,
        ref: normalizeKlineReference(existing),
      };
    }
  }

  const windowKey = buildWindowKlineCacheKey(
    input.symbol,
    input.timeframe,
    input.fromMs,
    input.toMs,
  );
  const sharedWindowCandles = await loadCandlesFromCacheKey(windowKey);
  if (sharedWindowCandles && sharedWindowCandles.length > 0) {
    return {
      candles: sharedWindowCandles,
      ref: normalizeKlineReference({
        key: windowKey,
        symbol: input.symbol,
        timeframe: input.timeframe,
        fromMs: input.fromMs,
        toMs: input.toMs,
        candleCount: sharedWindowCandles.length,
      }),
    };
  }

  const candles = await fetchHistoricalKlines({
    symbol: input.symbol,
    timeframe: input.timeframe,
    fromMs: input.fromMs,
    toMs: input.toMs,
  });

  try {
    const savedRef = await saveBacktestKlineCache({
      backtestId: input.backtestId,
      symbol: input.symbol,
      timeframe: input.timeframe,
      fromMs: input.fromMs,
      toMs: input.toMs,
      candles,
    });

    return {
      candles,
      ref: savedRef,
    };
  } catch (error) {
    console.error("[backtests] failed to persist kline cache", {
      backtestId: input.backtestId,
      symbol: input.symbol,
      timeframe: input.timeframe,
      fromMs: input.fromMs,
      toMs: input.toMs,
      error,
    });

    return { candles };
  }
}

async function fetchBacktestCandles(
  input: CreateBacktestInput,
  backtestId: string,
  refs?: KlineCacheReference[],
): Promise<BacktestComputationCandles> {
  const byTimeframe = new Map<OrchestratorTimeframe, Promise<CandleResolution>>();

  const getCandlesForTimeframe = (timeframe: OrchestratorTimeframe) => {
    const existing = byTimeframe.get(timeframe);
    if (existing) return existing;

    const created = resolveCandles({
      backtestId,
      symbol: input.symbol,
      timeframe,
      fromMs: input.fromMs,
      toMs: input.toMs,
      refs,
    });
    byTimeframe.set(timeframe, created);
    return created;
  };

  const [execution, primary, secondary] = await Promise.all([
    getCandlesForTimeframe(input.executionTimeframe),
    getCandlesForTimeframe(input.primaryRangeTimeframe),
    getCandlesForTimeframe(input.secondaryRangeTimeframe),
  ]);

  return {
    executionCandles: execution.candles,
    primaryRangeCandles: primary.candles,
    secondaryRangeCandles: secondary.candles,
    klineRefs: dedupeRefs([
      ...(refs ?? []),
      execution.ref,
      primary.ref,
      secondary.ref,
    ]),
  };
}

function runComputation(
  input: CreateBacktestInput,
  candles: BacktestComputationCandles,
): BacktestResult {
  if (candles.executionCandles.length < 80) {
    throw new Error(
      `Not enough execution candles (${candles.executionCandles.length}) for ${input.symbol}`,
    );
  }

  const bot = createRangingBot(input.strategyConfig);
  return bot.runBacktest({
    initialEquity: input.initialEquity,
    executionCandles: candles.executionCandles,
    primaryRangeCandles: candles.primaryRangeCandles,
    secondaryRangeCandles: candles.secondaryRangeCandles,
  });
}

function toInputFromRecord(record: BacktestRecord): CreateBacktestInput {
  return {
    symbol: record.symbol,
    fromMs: record.fromMs,
    toMs: record.toMs,
    executionTimeframe: record.executionTimeframe,
    primaryRangeTimeframe: record.primaryRangeTimeframe,
    secondaryRangeTimeframe: record.secondaryRangeTimeframe,
    initialEquity: record.initialEquity,
  };
}

function enrichTradesWithRangeLevels(
  input: CreateBacktestInput,
  candles: BacktestComputationCandles,
  trades: BacktestTrade[],
): BacktestTradeView[] {
  const bot = createRangingBot(input.strategyConfig);
  const indexByTime = new Map<number, number>();

  candles.executionCandles.forEach((candle, index) => {
    indexByTime.set(candle.time, index);
  });

  return trades.map((trade) => {
    const entryIndex = indexByTime.get(trade.entryTime);
    if (entryIndex === undefined) {
      return {
        ...trade,
        exits: [...trade.exits],
      };
    }

    try {
      const snapshot = bot.buildSignalSnapshot({
        executionCandles: candles.executionCandles,
        index: entryIndex,
        primaryRangeCandles: candles.primaryRangeCandles,
        secondaryRangeCandles: candles.secondaryRangeCandles,
      });

      return {
        ...trade,
        exits: [...trade.exits],
        rangeLevels: {
          val: snapshot.range.effective.val,
          vah: snapshot.range.effective.vah,
          poc: snapshot.range.effective.poc,
        },
      };
    } catch {
      return {
        ...trade,
        exits: [...trade.exits],
      };
    }
  });
}

export async function runBacktestJob(input: CreateBacktestInput): Promise<BacktestRecord> {
  const createdAtMs = Date.now();
  const backtestId = newBacktestId(input.symbol, createdAtMs);

  try {
    const candles = await fetchBacktestCandles(input, backtestId);
    const result = runComputation(input, candles);

    return {
      id: backtestId,
      createdAtMs,
      status: "completed",
      symbol: input.symbol,
      fromMs: input.fromMs,
      toMs: input.toMs,
      executionTimeframe: input.executionTimeframe,
      primaryRangeTimeframe: input.primaryRangeTimeframe,
      secondaryRangeTimeframe: input.secondaryRangeTimeframe,
      initialEquity: input.initialEquity,
      totalTrades: result.metrics.totalTrades,
      wins: result.metrics.wins,
      losses: result.metrics.losses,
      winRate: result.metrics.winRate,
      netPnl: result.metrics.netPnl,
      grossProfit: result.metrics.grossProfit,
      grossLoss: result.metrics.grossLoss,
      maxDrawdownPct: result.metrics.maxDrawdownPct,
      endingEquity: result.metrics.endingEquity,
      klineRefs: candles.klineRefs,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return toFailedRecord(input, backtestId, createdAtMs, message);
  }
}

export interface ReplayedBacktest {
  result: BacktestResult;
  chartCandles: Candle[];
  chartCandlesRef?: KlineCacheReference;
  trades: BacktestTradeView[];
  klineRefs: KlineCacheReference[];
}

export async function replayBacktestRecord(
  record: BacktestRecord,
  chartTimeframe: OrchestratorTimeframe,
): Promise<ReplayedBacktest> {
  const input = toInputFromRecord(record);
  const candles = await fetchBacktestCandles(
    input,
    record.id,
    record.klineRefs,
  );
  const chart = await resolveCandles({
    backtestId: record.id,
    symbol: record.symbol,
    timeframe: chartTimeframe,
    fromMs: record.fromMs,
    toMs: record.toMs,
    refs: candles.klineRefs,
  });
  const result = runComputation(input, candles);

  return {
    result,
    chartCandles: chart.candles,
    chartCandlesRef: chart.ref,
    trades: enrichTradesWithRangeLevels(input, candles, result.trades),
    klineRefs: dedupeRefs([...candles.klineRefs, chart.ref]),
  };
}
