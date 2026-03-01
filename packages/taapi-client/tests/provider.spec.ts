import { describe, expect, it } from "vitest";
import { TaapiClient } from "../src/client";
import { TaapiReversalSignalProvider } from "../src/provider";

describe("taapi reversal signal provider", () => {
  it("returns only high-confidence reversal signals by default", async () => {
    const client = new TaapiClient({
      secret: "secret",
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: "morningstar", result: { value: 100 }, errors: [] },
              { id: "engulfing", result: { value: 100 }, errors: [] },
              { id: "hammer", result: { value: 100 }, errors: [] },
              { id: "eveningstar", result: { value: -80 }, errors: [] },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    const provider = new TaapiReversalSignalProvider(client);
    const signals = await provider.scanLatest({
      exchange: "binance",
      symbol: "BTC/USDT",
      interval: "1h",
      patterns: ["morningstar", "engulfing", "hammer", "eveningstar"],
    });

    expect(signals.map((signal) => signal.pattern)).toEqual([
      "morningstar",
      "eveningstar",
    ]);
    expect(signals[0]?.direction).toBe("bullish");
    expect(signals[1]?.direction).toBe("bearish");
  });

  it("can include medium-tier patterns and enforces minimum match score", async () => {
    const client = new TaapiClient({
      secret: "secret",
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: "engulfing", result: { value: 100 }, errors: [] },
              { id: "harami", result: { value: 60 }, errors: [] },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    const provider = new TaapiReversalSignalProvider(client);
    const signals = await provider.scanLatest({
      exchange: "binance",
      symbol: "BTC/USDT",
      interval: "1h",
      patterns: ["engulfing", "harami"],
      options: { tiers: ["high", "medium"], minAbsoluteMatch: 80 },
    });

    expect(signals.map((signal) => signal.pattern)).toEqual(["engulfing"]);
  });
});
