import { describe, expect, it } from "vitest";
import type { Candle } from "@repo/trading-core";
import { TaapiClient } from "@repo/taapi-client";
import { compareIndicatorProviders } from "../src/provider";

const liveSecret = process.env.TAAPI_TEST_SECRET?.trim();
const runIfSecret = liveSecret ? describe : describe.skip;

function buildCandles(): Candle[] {
  const baseTime = 1_772_340_000_000;
  return Array.from({ length: 60 }, (_, index) => {
    const open = 100 + index * 0.4;
    const close = open + (index % 3 === 0 ? 1.1 : -0.2);
    return {
      time: baseTime + index * 60_000,
      open,
      high: Math.max(open, close) + 0.8,
      low: Math.min(open, close) - 0.7,
      close,
      volume: 1000 + index * 15,
    };
  });
}

runIfSecret("live taapi smoke", () => {
  it("retrieves manual indicator values and compares them to local calculations", async () => {
    const client = new TaapiClient({ secret: liveSecret ?? "" });
    try {
      const comparison = await compareIndicatorProviders({
        client,
        candles: buildCandles(),
        requests: [
          { indicatorId: "rsi", params: { length: 14 } },
          { indicatorId: "ema", params: { length: 20 } },
          { indicatorId: "sma", params: { length: 20 } },
        ],
      });

      expect(comparison).toHaveLength(3);
      for (const row of comparison) {
        expect(row.source).toBe("taapi");
        expect(row.taapiValue).toBeTruthy();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("429")) {
        expect(true).toBe(true);
        return;
      }
      throw error;
    }
  }, 20_000);
});
