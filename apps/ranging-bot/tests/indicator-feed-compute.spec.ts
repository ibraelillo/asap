import { describe, expect, it } from "vitest";
import type { Candle, IndicatorFeedRequirement } from "@repo/trading-engine";
import { computeIndicatorFeed } from "../src/indicator-feed-compute";

function makeCandles(): Candle[] {
  return [
    { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 110 },
    { time: 3, open: 12, high: 14, low: 11, close: 13, volume: 120 },
    { time: 4, open: 13, high: 15, low: 12, close: 14, volume: 130 },
    { time: 5, open: 14, high: 16, low: 13, close: 15, volume: 140 },
  ];
}

describe("computeIndicatorFeed", () => {
  it("computes ema and preserves series length", () => {
    const requirement: IndicatorFeedRequirement = {
      role: "fastEma",
      timeframe: "1h",
      indicatorId: "ema",
      params: { length: 3 },
      lookbackBars: 5,
      source: "close",
    };

    const outputs = computeIndicatorFeed(makeCandles(), requirement);
    expect(outputs.value).toHaveLength(5);
    expect(outputs.value?.at(-1)).toBeTypeOf("number");
  });

  it("computes wavetrend with both outputs", () => {
    const requirement: IndicatorFeedRequirement = {
      role: "wavetrend",
      timeframe: "15m",
      indicatorId: "wavetrend",
      params: {
        channelLength: 10,
        averageLength: 21,
        signalLength: 4,
      },
      lookbackBars: 5,
      source: "hlc3",
    };

    const outputs = computeIndicatorFeed(makeCandles(), requirement);
    expect(outputs.wt1).toHaveLength(5);
    expect(outputs.wt2).toHaveLength(5);
  });
});
