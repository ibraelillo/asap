import { describe, expect, it } from "vitest";
import type { Candle } from "@repo/trading-core";
import { LocalIndicatorProvider } from "@repo/market-context";
import { TaapiClient } from "@repo/taapi-client";
import { compareIndicatorProviders, prepareTaapiIndicatorProvider } from "../src/provider";

function buildCandles(count: number, start = 100): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const open = start + index * 0.8;
    const close = open + (index % 2 === 0 ? 1.2 : -0.3);
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 0.6;
    return {
      time: 1_700_000_000_000 + index * 60_000,
      open,
      high,
      low,
      close,
      volume: 1000 + index * 20,
    };
  });
}

describe("market-context taapi provider", () => {
  it("materializes a synchronous provider with taapi and fallback sources", async () => {
    const client = new TaapiClient({
      secret: "secret",
      fetchFn: async (input) => {
        const url = String(input);
        if (url.endsWith("/rsi")) {
          return new Response(JSON.stringify({ value: 44 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.endsWith("/fibonacciretracement")) {
          return new Response(
            JSON.stringify({
              value: 105,
              trend: "UPTREND",
              startPrice: 100,
              endPrice: 110,
              startTimestamp: 1,
              endTimestamp: 2,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify({ value: 55 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const provider = await prepareTaapiIndicatorProvider({
      client,
      candles: buildCandles(30),
      requests: [
        { indicatorId: "rsi", params: { length: 14 } },
        { indicatorId: "wavetrend", params: { channelLength: 10, averageLength: 21 } },
        { indicatorId: "fibonacciretracement", params: {} },
      ],
    });

    expect(
      provider.computeLatest({
        candles: buildCandles(30),
        request: { indicatorId: "rsi", params: { length: 14 } },
      }),
    ).toEqual({ value: 44 });
    expect(
      provider.explain({ indicatorId: "rsi", params: { length: 14 } })?.source,
    ).toBe("taapi");
    expect(
      provider.explain({
        indicatorId: "wavetrend",
        params: { channelLength: 10, averageLength: 21 },
      })?.source,
    ).toBe("local-fallback");
    expect(
      provider.explain({ indicatorId: "fibonacciretracement", params: {} })?.source,
    ).toBe("taapi");
  });

  it("compares taapi outputs against local indicator outputs", async () => {
    const candles = buildCandles(30);
    const localProvider = new LocalIndicatorProvider();
    const localRsi = localProvider.computeLatest({
      candles,
      request: { indicatorId: "rsi", params: { length: 14 } },
    });

    const client = new TaapiClient({
      secret: "secret",
      fetchFn: async () =>
        new Response(JSON.stringify(localRsi), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    const comparison = await compareIndicatorProviders({
      client,
      candles,
      requests: [{ indicatorId: "rsi", params: { length: 14 } }],
      localProvider,
    });

    expect(comparison).toHaveLength(1);
    expect(comparison[0]?.equal).toBe(true);
    expect(comparison[0]?.source).toBe("taapi");
  });
});
