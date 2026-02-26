import { createConfig } from "./config";
import { sizePosition } from "./risk";
import {
  buildSignalSnapshot,
  evaluateEntry,
  resolveTakeProfitLevels,
} from "./strategy";
import type {
  BacktestExit,
  BacktestInput,
  BacktestMetrics,
  BacktestResult,
  BacktestTrade,
  Candle,
  DeepPartial,
  RangeReversalConfig,
  Side,
} from "./types";

interface OpenPosition {
  side: Side;
  quantity: number;
  remainingQuantity: number;
  entryPrice: number;
  stopPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp1Done: boolean;
  tp2Done: boolean;
}

function feeFor(price: number, quantity: number, feeRate: number): number {
  return Math.abs(price * quantity) * feeRate;
}

function grossPnlFor(side: Side, entry: number, exit: number, qty: number, multiplier: number): number {
  if (side === "long") return (exit - entry) * qty * multiplier;
  return (entry - exit) * qty * multiplier;
}

function targetTouched(side: Side, candle: Candle, targetPrice: number): boolean {
  if (side === "long") return candle.high >= targetPrice;
  return candle.low <= targetPrice;
}

function stopTouched(side: Side, candle: Candle, stopPrice: number): boolean {
  if (side === "long") return candle.low <= stopPrice;
  return candle.high >= stopPrice;
}

function computeMaxDrawdownPct(equityCurve: { equity: number }[]): number {
  if (equityCurve.length === 0) return 0;

  let peak = equityCurve[0].equity;
  let maxDd = 0;

  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    if (peak <= 0) continue;

    const dd = (peak - point.equity) / peak;
    maxDd = Math.max(maxDd, dd);
  }

  return maxDd;
}

function buildMetrics(trades: BacktestTrade[], endingEquity: number, maxDrawdownPct: number): BacktestMetrics {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.netPnl > 0).length;
  const losses = trades.filter((t) => t.netPnl < 0).length;
  const netPnl = trades.reduce((acc, t) => acc + t.netPnl, 0);
  const grossProfit = trades.filter((t) => t.netPnl > 0).reduce((acc, t) => acc + t.netPnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.netPnl < 0).reduce((acc, t) => acc + t.netPnl, 0));

  return {
    totalTrades,
    wins,
    losses,
    winRate: totalTrades === 0 ? 0 : wins / totalTrades,
    netPnl,
    grossProfit,
    grossLoss,
    maxDrawdownPct,
    endingEquity,
  };
}

export function runBacktest(
  input: BacktestInput,
  overrides?: DeepPartial<RangeReversalConfig>,
): BacktestResult {
  const config = createConfig(overrides);
  const executionCandles = input.executionCandles;
  const primaryRangeCandles = input.primaryRangeCandles ?? executionCandles;
  const secondaryRangeCandles = input.secondaryRangeCandles ?? executionCandles;

  let equity = input.initialEquity;
  let cooldownUntilIndex = -1;
  let nextTradeId = 1;

  let position: OpenPosition | null = null;
  let activeTrade: BacktestTrade | null = null;

  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; equity: number }[] = [];

  const closePortion = (
    candle: Candle,
    reason: BacktestExit["reason"],
    quantity: number,
    price: number,
  ) => {
    if (!position || !activeTrade || quantity <= 0) return;

    const qty = Math.min(quantity, position.remainingQuantity);
    if (qty <= 0) return;

    const grossPnl = grossPnlFor(
      position.side,
      position.entryPrice,
      price,
      qty,
      config.risk.contractMultiplier,
    );
    const fee = feeFor(price, qty, config.risk.feeRate);
    const netPnl = grossPnl - fee;

    equity += netPnl;
    position.remainingQuantity -= qty;

    activeTrade.exits.push({
      reason,
      time: candle.time,
      price,
      quantity: qty,
      grossPnl,
      fee,
      netPnl,
    });

    activeTrade.grossPnl += grossPnl;
    activeTrade.fees += fee;
    activeTrade.netPnl += netPnl;

    if (position.remainingQuantity <= 1e-10) {
      position.remainingQuantity = 0;
      activeTrade.closeTime = candle.time;
      activeTrade.closePrice = price;
      trades.push(activeTrade);
      activeTrade = null;
      position = null;
    }
  };

  for (let i = 0; i < executionCandles.length; i++) {
    const candle = executionCandles[i];

    const snapshot = buildSignalSnapshot({
      executionCandles,
      index: i,
      primaryRangeCandles,
      secondaryRangeCandles,
      config,
    });
    const signal = evaluateEntry(snapshot, config);

    if (position && activeTrade) {
      const targetPrices = [
        {
          name: "tp1" as const,
          done: position.tp1Done,
          price: position.tp1Price,
          quantity: position.quantity * config.exits.tp1SizePct,
        },
        {
          name: "tp2" as const,
          done: position.tp2Done,
          price: position.tp2Price,
          quantity: position.quantity * config.exits.tp2SizePct,
        },
      ]
        .filter((t) => !t.done)
        .sort((a, b) => {
          if (position?.side === "long") return a.price - b.price;
          return b.price - a.price;
        });

      const processTargets = () => {
        if (!position || !activeTrade) return;

        for (const target of targetPrices) {
          if (!position) return;

          if (!targetTouched(position.side, candle, target.price)) {
            continue;
          }

          const quantity = Math.min(target.quantity, position.remainingQuantity);
          const reason = target.name;
          closePortion(candle, reason, quantity, target.price);

          if (!position) return;

          if (target.name === "tp1") {
            position.tp1Done = true;
            if (config.exits.moveStopToBreakevenOnTp1) {
              position.stopPrice = position.entryPrice;
            }
          } else {
            position.tp2Done = true;
          }
        }
      };

      const processStop = () => {
        if (!position || !activeTrade) return;

        if (stopTouched(position.side, candle, position.stopPrice)) {
          closePortion(candle, "stop", position.remainingQuantity, position.stopPrice);
        }
      };

      if (config.fillModel.intrabarExitPriority === "stop-first") {
        processStop();
        if (position) processTargets();
      } else {
        processTargets();
        if (position) processStop();
      }

      if (position && config.exits.runnerExitOnOppositeSignal) {
        const isOpposite =
          (position.side === "long" && signal.signal === "short") ||
          (position.side === "short" && signal.signal === "long");

        if (isOpposite) {
          closePortion(candle, "signal", position.remainingQuantity, candle.close);
        }
      }

      if (!position) {
        cooldownUntilIndex = i + config.exits.cooldownBars + 1;
      }
    }

    if (!position && i >= cooldownUntilIndex && signal.signal) {
      const side = signal.signal;
      const entryPrice = candle.close;
      const stopPrice =
        side === "long"
          ? candle.low * (1 - config.risk.slBufferPct)
          : candle.high * (1 + config.risk.slBufferPct);

      const sizing = sizePosition({
        equity,
        entryPrice,
        stopPrice,
        risk: config.risk,
      });

      if (sizing.quantity > 0) {
        const levels = resolveTakeProfitLevels(snapshot.range.effective, side, config);

        position = {
          side,
          quantity: sizing.quantity,
          remainingQuantity: sizing.quantity,
          entryPrice,
          stopPrice,
          tp1Price: levels.tp1,
          tp2Price: levels.tp2,
          tp1Done: false,
          tp2Done: false,
        };

        const entryFee = feeFor(entryPrice, sizing.quantity, config.risk.feeRate);
        equity -= entryFee;

        activeTrade = {
          id: nextTradeId++,
          side,
          entryTime: candle.time,
          entryPrice,
          stopPriceAtEntry: stopPrice,
          quantity: sizing.quantity,
          entryFee,
          exits: [],
          closeTime: candle.time,
          closePrice: entryPrice,
          grossPnl: 0,
          fees: entryFee,
          netPnl: -entryFee,
        };
      }
    }

    equityCurve.push({
      time: candle.time,
      equity,
    });
  }

  const lastCandle = executionCandles[executionCandles.length - 1];
  if (position && activeTrade && lastCandle) {
    closePortion(lastCandle, "end", position.remainingQuantity, lastCandle.close);
    if (equityCurve.length > 0) {
      equityCurve[equityCurve.length - 1] = {
        time: lastCandle.time,
        equity,
      };
    }
  }

  const maxDrawdownPct = computeMaxDrawdownPct(equityCurve);
  const metrics = buildMetrics(trades, equity, maxDrawdownPct);

  return {
    config,
    trades,
    equityCurve,
    metrics,
  };
}
