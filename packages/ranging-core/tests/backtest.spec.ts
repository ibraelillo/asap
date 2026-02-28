import { describe, expect, it } from "vitest";
import type { BacktestCandle, BacktestResult } from "../src/types";
import { createConfiguredRangeReversalStrategy } from "../src";
import { candle } from "./helpers";

const HOUR_MS = 60 * 60 * 1000;
const START_TIME = Date.UTC(2024, 0, 1, 0, 0, 0, 0);

function printBacktestSummary(
  label: string,
  result: BacktestResult,
  candles: number,
): void {
  console.info(
    `[backtest ${label}] ${JSON.stringify({
      candles,
      trades: result.metrics.totalTrades,
      wins: result.metrics.wins,
      losses: result.metrics.losses,
      winRate: Number(result.metrics.winRate.toFixed(4)),
      netPnl: Number(result.metrics.netPnl.toFixed(4)),
      endingEquity: Number(result.metrics.endingEquity.toFixed(4)),
      maxDrawdownPct: Number(result.metrics.maxDrawdownPct.toFixed(4)),
    })}`,
  );
}

function buildPeriodCandles(days: number): BacktestCandle[] {
  const candles: BacktestCandle[] = [];

  for (let day = 0; day < days; day++) {
    const basePrice = 100 + day * 0.15;

    for (let hour = 0; hour < 24; hour++) {
      const index = day * 24 + hour;
      const time = START_TIME + index * HOUR_MS;

      if (hour === 1) {
        candles.push(
          candle(
            time,
            basePrice,
            basePrice + 0.8,
            basePrice - 1,
            basePrice,
            120,
            {
              rangeValid: true,
              val: basePrice + 1,
              vah: basePrice + 4,
              poc: basePrice + 2,
              bullishDivergence: true,
              bearishDivergence: false,
              moneyFlowSlope: 0.4,
              bullishSfp: true,
              bearishSfp: false,
            },
          ),
        );
        continue;
      }

      if (hour === 2) {
        candles.push(
          candle(
            time,
            basePrice,
            basePrice + 2.3,
            basePrice - 0.2,
            basePrice + 1.8,
            110,
            {
              rangeValid: false,
            },
          ),
        );
        continue;
      }

      if (hour === 3) {
        candles.push(
          candle(
            time,
            basePrice + 1.8,
            basePrice + 4.4,
            basePrice + 1.2,
            basePrice + 3.7,
            130,
            {
              rangeValid: false,
            },
          ),
        );
        continue;
      }

      const drift = Math.sin(index / 8) * 0.25;
      candles.push(
        candle(
          time,
          basePrice + drift,
          basePrice + drift + 0.45,
          basePrice + drift - 0.45,
          basePrice + drift,
          90,
          {
            rangeValid: false,
          },
        ),
      );
    }
  }

  return candles;
}

describe("deterministic backtest", () => {
  it("closes a long trade via tp1 and tp2 with deterministic output", () => {
    const strategy = createConfiguredRangeReversalStrategy({
      risk: {
        riskPctPerTrade: 0.01,
        leverage: 10,
        maxNotionalPctEquity: 1,
        slBufferPct: 0,
        feeRate: 0,
      },
      exits: {
        tp1SizePct: 0.5,
        tp2SizePct: 0.5,
        tp2LongLevel: "VAH",
        cooldownBars: 1,
      },
    });

    const executionCandles = [
      candle(1, 100, 101, 99, 100),
      candle(2, 100, 101, 99, 100, 100, {
        rangeValid: true,
        val: 101,
        vah: 110,
        poc: 103,
        bullishDivergence: true,
        bearishDivergence: false,
        moneyFlowSlope: 0.4,
        bullishSfp: true,
        bearishSfp: false,
      }),
      candle(3, 100, 104, 100, 103),
      candle(4, 103, 111, 103, 110),
    ];

    const first = strategy.runBacktest({
      initialEquity: 1000,
      executionCandles,
      primaryRangeCandles: executionCandles,
      secondaryRangeCandles: executionCandles,
    });

    const second = strategy.runBacktest({
      initialEquity: 1000,
      executionCandles,
      primaryRangeCandles: executionCandles,
      secondaryRangeCandles: executionCandles,
    });

    printBacktestSummary("baseline_tp_tp", first, executionCandles.length);

    expect(first.metrics.endingEquity).toBeCloseTo(1065, 8);
    expect(first.metrics.totalTrades).toBe(1);
    expect(first.trades[0]?.netPnl).toBeCloseTo(65, 8);

    expect(first.metrics).toEqual(second.metrics);
    expect(first.trades).toEqual(second.trades);
    expect(first.equityCurve).toEqual(second.equityCurve);
  });

  it("closes a long trade at stop loss", () => {
    const strategy = createConfiguredRangeReversalStrategy({
      risk: {
        riskPctPerTrade: 0.01,
        leverage: 10,
        maxNotionalPctEquity: 1,
        slBufferPct: 0,
        feeRate: 0,
      },
      exits: {
        tp1SizePct: 0.5,
        tp2SizePct: 0.5,
        tp2LongLevel: "VAH",
      },
    });

    const executionCandles = [
      candle(1, 100, 101, 99, 100),
      candle(2, 100, 101, 99, 100, 100, {
        rangeValid: true,
        val: 101,
        vah: 108,
        poc: 103,
        bullishDivergence: true,
        bearishDivergence: false,
        moneyFlowSlope: 0.4,
        bullishSfp: true,
        bearishSfp: false,
      }),
      candle(3, 100, 100, 98, 99),
    ];

    const result = strategy.runBacktest({
      initialEquity: 1000,
      executionCandles,
      primaryRangeCandles: executionCandles,
      secondaryRangeCandles: executionCandles,
    });

    printBacktestSummary("baseline_stop", result, executionCandles.length);

    expect(result.metrics.totalTrades).toBe(1);
    expect(result.trades[0]?.exits[0]?.reason).toBe("stop");
    expect(result.metrics.endingEquity).toBeCloseTo(990, 8);
  });

  it("exits runner on opposite signal", () => {
    const strategy = createConfiguredRangeReversalStrategy({
      risk: {
        riskPctPerTrade: 0.01,
        leverage: 10,
        maxNotionalPctEquity: 1,
        slBufferPct: 0,
        feeRate: 0,
      },
      exits: {
        tp1SizePct: 0.5,
        tp2SizePct: 0,
        tp2LongLevel: "VAH",
        cooldownBars: 1,
      },
    });

    const executionCandles = [
      candle(1, 100, 101, 99, 100),
      candle(2, 100, 101, 99, 100, 100, {
        rangeValid: true,
        val: 101,
        vah: 110,
        poc: 103,
        bullishDivergence: true,
        bearishDivergence: false,
        moneyFlowSlope: 0.5,
        bullishSfp: true,
        bearishSfp: false,
      }),
      candle(3, 100, 103, 100, 103),
      candle(4, 103, 103, 101, 102, 100, {
        rangeValid: true,
        val: 95,
        vah: 101,
        poc: 98,
        bullishDivergence: false,
        bearishDivergence: true,
        moneyFlowSlope: -0.4,
        bullishSfp: false,
        bearishSfp: true,
      }),
    ];

    const result = strategy.runBacktest({
      initialEquity: 1000,
      executionCandles,
      primaryRangeCandles: executionCandles,
      secondaryRangeCandles: executionCandles,
    });

    printBacktestSummary(
      "baseline_signal_exit",
      result,
      executionCandles.length,
    );

    expect(result.metrics.totalTrades).toBe(1);
    expect(result.trades[0]?.exits.at(-1)?.reason).toBe("signal");
    expect(result.metrics.endingEquity).toBeCloseTo(1025, 8);
  });

  it.each([
    { label: "1_week", days: 7 },
    { label: "15_days", days: 15 },
    { label: "1_month", days: 30 },
  ])("prints deterministic backtest summary for $label", ({ label, days }) => {
    const strategy = createConfiguredRangeReversalStrategy({
      risk: {
        riskPctPerTrade: 0.01,
        leverage: 10,
        maxNotionalPctEquity: 1,
        feeRate: 0,
      },
      exits: {
        tp1SizePct: 0.5,
        tp2SizePct: 0.5,
        tp1Level: "POC",
        tp2LongLevel: "VAH",
        cooldownBars: 1,
      },
    });

    const executionCandles = buildPeriodCandles(days);

    const first = strategy.runBacktest({
      initialEquity: 1000,
      executionCandles,
      primaryRangeCandles: executionCandles,
      secondaryRangeCandles: executionCandles,
    });

    const second = strategy.runBacktest({
      initialEquity: 1000,
      executionCandles,
      primaryRangeCandles: executionCandles,
      secondaryRangeCandles: executionCandles,
    });

    printBacktestSummary(label, first, executionCandles.length);

    expect(first.metrics).toEqual(second.metrics);
    expect(first.trades).toEqual(second.trades);
    expect(first.equityCurve).toEqual(second.equityCurve);

    expect(first.metrics.totalTrades).toBe(days);
    expect(first.metrics.wins).toBe(days);
    expect(first.metrics.losses).toBe(0);
    expect(first.metrics.netPnl).toBeGreaterThan(0);
    expect(first.metrics.endingEquity).toBeGreaterThan(1000);
  });
});
