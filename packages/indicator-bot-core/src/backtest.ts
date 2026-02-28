import {
  runBacktestEngine,
  type BacktestRequest,
  type BotDefinition,
  type Candle,
  type PositionSizingResult,
  type SimulatedFill,
  type SimulatedPosition,
  type Timeframe,
} from "@repo/trading-engine";
import { createIndicatorBotStrategy } from "./strategy";
import type {
  IndicatorBotConfig,
  IndicatorBotIntentMeta,
  IndicatorBotSnapshot,
} from "./types";

export interface IndicatorBotBacktestInput {
  botId: string;
  symbol: string;
  initialEquity: number;
  executionTimeframe: Timeframe;
  executionCandles: Candle[];
  primaryRangeCandles: Candle[];
  secondaryRangeCandles: Candle[];
}

export interface IndicatorBotBacktestTrade {
  id: number;
  side: "long" | "short";
  entryTime: number;
  entryPrice: number;
  stopPriceAtEntry: number;
  quantity: number;
  entryFee: number;
  exits: Array<{
    reason: "tp1" | "tp2" | "stop" | "signal" | "end";
    time: number;
    price: number;
    quantity: number;
    grossPnl: number;
    fee: number;
    netPnl: number;
  }>;
  closeTime: number;
  closePrice: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
}

function createSyntheticBot(input: {
  botId: string;
  symbol: string;
  executionTimeframe: Timeframe;
  strategyConfig: IndicatorBotConfig;
}): BotDefinition {
  const nowMs = Date.now();
  return {
    id: input.botId,
    name: input.symbol,
    strategyId: "indicator-bot",
    strategyVersion: "1",
    exchangeId: "paper",
    accountId: "default",
    symbol: input.symbol,
    marketType: "futures",
    status: "active",
    execution: {
      trigger: "event",
      executionTimeframe: input.executionTimeframe,
      warmupBars: 0,
    },
    context: {
      primaryPriceTimeframe: input.executionTimeframe,
      additionalTimeframes: [],
      providers: [],
    },
    riskProfileId: `${input.botId}:risk`,
    strategyConfig: input.strategyConfig as unknown as Record<string, unknown>,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

function createBacktestRequest(
  input: IndicatorBotBacktestInput,
): BacktestRequest {
  return {
    id: `${input.botId}-indicator-backtest`,
    botId: input.botId,
    fromMs: input.executionCandles[0]?.time ?? 0,
    toMs: input.executionCandles[input.executionCandles.length - 1]?.time ?? 0,
    chartTimeframe: input.executionTimeframe,
    initialEquity: input.initialEquity,
    slippageModel: { type: "none" },
    feeModel: { type: "fixed-rate", rate: 0 },
    createdAtMs: Date.now(),
  };
}

function sizePosition(input: {
  equity: number;
  entryPrice: number;
  stopPrice: number;
  config: IndicatorBotConfig;
}): PositionSizingResult {
  const stopDistance = Math.abs(input.entryPrice - input.stopPrice);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) {
    return {
      quantity: 0,
    };
  }

  const riskAmount = input.equity * input.config.risk.riskPctPerTrade;
  const riskQuantity = riskAmount / stopDistance;
  const notionalCap = input.equity * input.config.risk.maxNotionalPctEquity;
  const maxQuantityByNotional =
    input.entryPrice > 0 ? notionalCap / input.entryPrice : 0;
  const quantity = Math.max(0, Math.min(riskQuantity, maxQuantityByNotional));

  return {
    quantity,
    riskAmount,
    stopDistance,
    notional: quantity * input.entryPrice,
    estimatedLossAtStop: quantity * stopDistance,
    usedNotionalCap: maxQuantityByNotional < riskQuantity,
  };
}

function toExitReason(
  fill: SimulatedFill,
): "tp1" | "tp2" | "stop" | "signal" | "end" {
  if (fill.reason === "tp") {
    return fill.label === "tp1" ? "tp1" : "tp2";
  }
  if (fill.reason === "reduce" || fill.reason === "entry") {
    return "signal";
  }
  return fill.reason;
}

function toTradeView(
  position: SimulatedPosition<IndicatorBotIntentMeta>,
  index: number,
): IndicatorBotBacktestTrade {
  const entryFill = position.fills.find((fill) => fill.reason === "entry");
  const exits = position.fills.filter((fill) => fill.reason !== "entry");
  const finalExit = exits[exits.length - 1];

  return {
    id: index + 1,
    side: position.side,
    entryTime: position.openedAtMs ?? entryFill?.time ?? 0,
    entryPrice: position.avgEntryPrice ?? entryFill?.price ?? 0,
    stopPriceAtEntry:
      position.meta?.initialStopPrice ?? position.stopPrice ?? 0,
    quantity: position.quantity,
    entryFee: position.entryFee,
    exits: exits.map((fill) => ({
      reason: toExitReason(fill),
      time: fill.time,
      price: fill.price,
      quantity: fill.quantity,
      grossPnl: fill.grossPnl,
      fee: fill.fee,
      netPnl: fill.netPnl,
    })),
    closeTime:
      position.closedAtMs ?? finalExit?.time ?? position.openedAtMs ?? 0,
    closePrice:
      position.closePrice ?? finalExit?.price ?? position.avgEntryPrice ?? 0,
    grossPnl: exits.reduce((total, fill) => total + fill.grossPnl, 0),
    fees:
      position.entryFee + exits.reduce((total, fill) => total + fill.fee, 0),
    netPnl: position.realizedPnl - position.entryFee,
  };
}

export function runIndicatorBotBacktest(
  input: IndicatorBotBacktestInput,
  config: IndicatorBotConfig,
) {
  const strategy = createIndicatorBotStrategy(config);
  const bot = createSyntheticBot({
    botId: input.botId,
    symbol: input.symbol,
    executionTimeframe: input.executionTimeframe,
    strategyConfig: config,
  });
  const request = createBacktestRequest(input);

  const result = runBacktestEngine<
    IndicatorBotConfig,
    IndicatorBotSnapshot,
    IndicatorBotIntentMeta
  >({
    request,
    bot,
    config,
    strategy,
    market: {
      executionCandles: input.executionCandles,
      series: {
        primaryRange: input.primaryRangeCandles,
        secondaryRange: input.secondaryRangeCandles,
      },
    },
    positionSizer: ({ candle, intent, equity }) =>
      sizePosition({
        equity,
        entryPrice: intent.entry.price ?? candle.close,
        stopPrice: intent.risk.stopPrice,
        config,
      }),
  });

  return {
    config,
    result,
    trades: result.positions.map((position, index) =>
      toTradeView(position, index),
    ),
  };
}
