import { describe, expect, it } from "vitest";
import { TaapiClient } from "../src/client";
import type { TaapiBulkResponse } from "../src/types";

function createFetchStub(output: unknown) {
  return async (input: string | URL, init?: RequestInit) =>
    new Response(JSON.stringify(output), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-url": String(input),
        "x-method": init?.method ?? "GET",
      },
    });
}

describe("taapi client", () => {
  it("builds direct scalar indicator requests and parses latest response", async () => {
    let requestedUrl = "";
    const client = new TaapiClient({
      secret: "secret",
      fetchFn: async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ value: 52.4 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const response = await client.getScalarIndicator("rsi", {
      exchange: "binance",
      symbol: "BTC/USDT",
      interval: "1h",
      period: 14,
      backtrack: 1,
    });

    expect(requestedUrl).toContain("/rsi?");
    expect(requestedUrl).toContain("exchange=binance");
    expect(requestedUrl).toContain("symbol=BTC%2FUSDT");
    expect(requestedUrl).toContain("interval=1h");
    expect(requestedUrl).toContain("period=14");
    expect(requestedUrl).toContain("backtrack=1");
    expect(response).toEqual({ value: 52.4 });
  });

  it("posts manual indicator candles to TAAPI", async () => {
    let requestUrl = "";
    let requestBody = "";
    const client = new TaapiClient({
      secret: "secret",
      fetchFn: async (input, init) => {
        requestUrl = String(input);
        requestBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ value: 61.1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await client.postManualScalarIndicator("ema", {
      candles: [
        { open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, timestamp: 1000 },
        { open: 1.5, high: 2.5, low: 1, close: 2, volume: 12, timestamp: 2000 },
      ],
      period: 20,
    });

    expect(requestUrl).toBe("https://api.taapi.io/ema");
    expect(requestBody).toContain("\"secret\":\"secret\"");
    expect(requestBody).toContain("\"candles\"");
    expect(requestBody).toContain("\"period\":20");
  });

  it("posts bulk requests and parses the documented response shape", async () => {
    const bulkResponse: TaapiBulkResponse = {
      data: [
        {
          id: "morningstar",
          result: { value: 100 },
          errors: [],
        },
      ],
    };
    const client = new TaapiClient({
      secret: "secret",
      fetchFn: createFetchStub(bulkResponse) as typeof fetch,
    });

    const response = await client.postBulk({
      construct: {
        exchange: "binance",
        symbol: "BTC/USDT",
        interval: "1h",
        indicators: [{ indicator: "morningstar", id: "morningstar" }],
      },
    });

    expect(response.data[0]?.id).toBe("morningstar");
    expect(response.data[0]?.result.value).toBe(100);
  });
});
