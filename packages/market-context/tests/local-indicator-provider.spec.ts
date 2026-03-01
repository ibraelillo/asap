import { describe, expect, it } from "vitest";
import type { Candle } from "@repo/trading-core";
import { LocalIndicatorProvider } from "../src/local-indicator-provider";

function buildDivergenceCandles(): Candle[] {
  const baseTime = 1_700_000_000_000;
  return [
    { time: baseTime + 0, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
    { time: baseTime + 60_000, open: 100, high: 102, low: 98, close: 101, volume: 1050 },
    { time: baseTime + 120_000, open: 101, high: 103, low: 97, close: 102, volume: 1100 },
    { time: baseTime + 180_000, open: 102, high: 104, low: 96, close: 103, volume: 1150 },
    { time: baseTime + 240_000, open: 103, high: 105, low: 95, close: 104, volume: 1200 },
    { time: baseTime + 300_000, open: 104, high: 106, low: 94, close: 103, volume: 1400 },
    { time: baseTime + 360_000, open: 103, high: 104, low: 93, close: 102, volume: 1500 },
    { time: baseTime + 420_000, open: 102, high: 103, low: 92, close: 101, volume: 1600 },
    { time: baseTime + 480_000, open: 101, high: 102, low: 91, close: 103, volume: 1700 },
    { time: baseTime + 540_000, open: 103, high: 105, low: 90, close: 104, volume: 1800 },
  ];
}

describe("local indicator provider", () => {
  it("computes divergence indicators for rsi, mfi, and wavetrend", () => {
    const provider = new LocalIndicatorProvider();
    const candles = buildDivergenceCandles();

    const rsi = provider.computeLatest({
      candles,
      request: { indicatorId: "rsidivergence", params: { length: 5, lookbackBars: 5 } },
    });
    const mfi = provider.computeLatest({
      candles,
      request: { indicatorId: "mfidivergence", params: { length: 5, lookbackBars: 5 } },
    });
    const wt = provider.computeLatest({
      candles,
      request: {
        indicatorId: "wavetrenddivergence",
        params: { channelLength: 6, averageLength: 9, lookbackBars: 5 },
      },
    });

    expect(rsi).toHaveProperty("bullish");
    expect(rsi).toHaveProperty("bearish");
    expect(mfi).toHaveProperty("bullish");
    expect(mfi).toHaveProperty("bearish");
    expect(wt).toHaveProperty("bullish");
    expect(wt).toHaveProperty("bearish");
    expect(typeof rsi.bullish).toBe("boolean");
    expect(typeof mfi.bearish).toBe("boolean");
    expect(typeof wt.bullish).toBe("boolean");
  });
});
