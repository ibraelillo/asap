import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createConfiguredRangeReversalStrategy } from "../src";
import type { BacktestCandle, BacktestResult } from "../src/types";

interface KucoinFixture {
  exchange: string;
  endpoint: string;
  symbol: string;
  granularityMinutes: number;
  months: number;
  startMs: number;
  endMs: number;
  fetchedAt: string;
  candleCount: number;
  candles: BacktestCandle[];
}

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/kucoin-futures-XBTUSDTM-1h-last-3months.json",
);

async function loadFixture(): Promise<KucoinFixture> {
  const raw = await readFile(fixturePath, "utf8");
  return JSON.parse(raw) as KucoinFixture;
}

function sliceLastDays(
  candles: BacktestCandle[],
  granularityMinutes: number,
  days: number,
): BacktestCandle[] {
  const bars = Math.ceil((days * 24 * 60) / granularityMinutes);
  return candles.slice(-Math.max(1, bars));
}

function printBacktestSummary(
  label: string,
  result: BacktestResult,
  candles: number,
): void {
  console.info(
    `[backtest real:${label}] ${JSON.stringify({
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

describe("real kucoin klines backtest", () => {
  it.each([
    { label: "1_week", days: 7 },
    { label: "15_days", days: 15 },
    { label: "1_month", days: 30 },
  ])(
    "runs deterministically on $label from real fixture",
    async ({ label, days }) => {
      const fixture = await loadFixture();
      const executionCandles = sliceLastDays(
        fixture.candles,
        fixture.granularityMinutes,
        days,
      );

      expect(fixture.exchange).toBe("kucoin-futures");
      expect(fixture.candleCount).toBe(fixture.candles.length);
      expect(executionCandles.length).toBeGreaterThan(100);

      const strategy = createConfiguredRangeReversalStrategy({
        signal: {
          requireDivergence: false,
          requireSfp: false,
        },
        risk: {
          riskPctPerTrade: 0.01,
          leverage: 5,
          maxNotionalPctEquity: 1,
          feeRate: 0.0006,
        },
        exits: {
          tp1Level: "POC",
          tp2LongLevel: "VAH",
          tp2ShortLevel: "VAL",
          cooldownBars: 1,
        },
      });

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

      expect(Number.isFinite(first.metrics.netPnl)).toBe(true);
      expect(Number.isFinite(first.metrics.endingEquity)).toBe(true);
      expect(first.metrics.totalTrades).toBeGreaterThanOrEqual(0);
    },
  );
});
