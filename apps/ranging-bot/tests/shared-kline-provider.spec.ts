import { describe, expect, it } from "vitest";
import type { CandleFeedSnapshot } from "@repo/trading-engine";
import { SharedFeedBackedKlineProvider } from "../src/shared-kline-provider";

const snapshot: CandleFeedSnapshot = {
  exchangeId: "kucoin",
  symbol: "SUIUSDTM",
  timeframe: "1h",
  candles: [
    { time: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    { time: 2000, open: 1.5, high: 2.2, low: 1.4, close: 2, volume: 12 },
    { time: 3000, open: 2, high: 2.4, low: 1.9, close: 2.1, volume: 8 },
  ],
  fromMs: 1000,
  toMs: 3000,
  generatedAt: new Date(0).toISOString(),
  lastClosedCandleTime: 3000,
};

describe("SharedFeedBackedKlineProvider", () => {
  it("returns the latest candles up to the requested end time", async () => {
    const provider = new SharedFeedBackedKlineProvider([snapshot]);
    const candles = await provider.fetchKlines({
      symbol: "SUIUSDTM",
      timeframe: "1h",
      limit: 2,
      endTimeMs: 2500,
    });

    expect(candles.map((candle) => candle.time)).toEqual([1000, 2000]);
  });

  it("fails when the timeframe snapshot is missing", async () => {
    const provider = new SharedFeedBackedKlineProvider([snapshot]);

    await expect(
      provider.fetchKlines({
        symbol: "SUIUSDTM",
        timeframe: "4h",
        limit: 2,
      }),
    ).rejects.toThrow("Missing shared market snapshot");
  });
});
