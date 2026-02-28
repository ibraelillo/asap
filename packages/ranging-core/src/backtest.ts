import {
  runBacktestEngine,
  type BacktestRequest as EngineBacktestRequest,
  type SimulatedPosition,
} from "@repo/trading-engine";
import { createConfig } from "./config";
import { sizePosition } from "./risk";
import { createRangeReversalStrategy } from "./strategy";
import type {
  BacktestExit,
  BacktestInput,
  BacktestResult,
  BacktestTrade,
  DeepPartial,
  RangeReversalConfig,
  RangeReversalIntentMeta,
} from "./types";
import { createRangeReversalBotDefinition } from "./types";

function toTradeExits(
  trade: ReturnType<typeof toTradeFromPosition>["exits"],
): BacktestExit[] {
  return trade;
}

function toTradeFromPosition(
  position: SimulatedPosition<RangeReversalIntentMeta>,
  id: number,
): BacktestTrade {
  const entryFill = position.fills.find((fill) => fill.reason === "entry");
  const exits = position.fills
    .filter((fill) => fill.reason !== "entry")
    .map((fill) => ({
      reason:
        fill.label === "tp1"
          ? "tp1"
          : fill.label === "tp2"
            ? "tp2"
            : fill.reason === "stop"
              ? "stop"
              : fill.reason === "signal"
                ? "signal"
                : "end",
      time: fill.time,
      price: fill.price,
      quantity: fill.quantity,
      grossPnl: fill.grossPnl,
      fee: fill.fee,
      netPnl: fill.netPnl,
    })) satisfies BacktestExit[];

  const grossPnl = exits.reduce((sum, exit) => sum + exit.grossPnl, 0);
  const exitFees = exits.reduce((sum, exit) => sum + exit.fee, 0);
  const netPnl =
    exits.reduce((sum, exit) => sum + exit.netPnl, 0) - position.entryFee;

  return {
    id,
    side: position.side,
    entryTime: position.openedAtMs ?? entryFill?.time ?? 0,
    entryPrice: position.avgEntryPrice ?? entryFill?.price ?? 0,
    stopPriceAtEntry: position.stopPrice ?? 0,
    quantity: position.quantity,
    entryFee: position.entryFee,
    exits: toTradeExits(exits),
    closeTime:
      position.closedAtMs ??
      exits[exits.length - 1]?.time ??
      position.openedAtMs ??
      0,
    closePrice:
      position.closePrice ??
      exits[exits.length - 1]?.price ??
      position.avgEntryPrice ??
      0,
    grossPnl,
    fees: position.entryFee + exitFees,
    netPnl,
  };
}

export function runBacktest(
  input: BacktestInput,
  overrides?: DeepPartial<RangeReversalConfig>,
): BacktestResult {
  const config = createConfig(overrides);
  const strategy = createRangeReversalStrategy(config);
  const bot = createRangeReversalBotDefinition({
    botId: "range-reversal-backtest",
    symbol: "RANGE-BACKTEST",
  });
  const request: EngineBacktestRequest = {
    id: "range-reversal-backtest",
    botId: bot.id,
    fromMs: input.executionCandles[0]?.time ?? 0,
    toMs: input.executionCandles[input.executionCandles.length - 1]?.time ?? 0,
    chartTimeframe: bot.execution.executionTimeframe,
    initialEquity: input.initialEquity,
    slippageModel: { type: "none" },
    feeModel: { type: "fixed-rate", rate: config.risk.feeRate },
    createdAtMs: Date.now(),
  };

  const engine = runBacktestEngine({
    request,
    bot: {
      ...bot,
      metadata: {
        intrabarExitPriority: config.fillModel.intrabarExitPriority,
      },
    },
    config,
    strategy,
    market: {
      executionCandles: input.executionCandles,
      series: {
        primaryRange: input.primaryRangeCandles ?? input.executionCandles,
        secondaryRange: input.secondaryRangeCandles ?? input.executionCandles,
      },
    },
    positionSizer: ({ candle, equity, intent }) => {
      return sizePosition({
        equity,
        entryPrice: intent.entry.price ?? candle.close,
        stopPrice: intent.risk.stopPrice,
        risk: config.risk,
      });
    },
  });

  const trades = engine.positions.map((position, index) =>
    toTradeFromPosition(position, index + 1),
  );

  return {
    config,
    trades,
    equityCurve: engine.equityCurve,
    metrics: engine.metrics,
    engine,
  };
}
