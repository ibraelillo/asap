import { describe, expect, it } from "vitest";
import type { KucoinClient } from "@repo/kucoin";
import { KucoinKlineProvider, kucoinKlineInternals } from "../src/exchanges/kucoin/klines";

describe("kucoin kline parsing", () => {
  it("parses and sorts rows deterministically", () => {
    const rows = [
      [1700000010, "100", "101", "103", "99", "15"],
      [1700000000, "99", "100", "102", "98", "10"],
      [1700000010, "100", "101", "103", "99", "15"],
    ];

    const candles = kucoinKlineInternals.parseRows(rows, 10);

    expect(candles).toHaveLength(2);
    expect(candles[0]?.time).toBe(1700000000 * 1000);
    expect(candles[1]?.time).toBe(1700000010 * 1000);
  });

  it("supports alternate ohlc row format", () => {
    const formatA = kucoinKlineInternals.parseOHLC([1700000000, "100", "101", "103", "99", "10"]);
    const formatB = kucoinKlineInternals.parseOHLC([1700000000, "100", "103", "99", "101", "10"]);

    expect(formatA.open).toBe(100);
    expect(formatA.high).toBeGreaterThanOrEqual(formatA.close);

    expect(formatB.open).toBe(100);
    expect(formatB.low).toBeLessThanOrEqual(formatB.close);
  });

  it("uses millisecond from/to query params", async () => {
    const requests: Array<{ from: number; to: number; symbol: string; granularity: number }> = [];

    const provider = new KucoinKlineProvider({
      getKlines: async (query) => {
        requests.push(query);
        return [];
      },
    } as KucoinClient);

    const endTimeMs = 1_700_000_000_000;
    await provider.fetchKlines({
      symbol: "XBTUSDTM",
      timeframe: "1h",
      limit: 2,
      endTimeMs,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.to).toBe(endTimeMs);
    expect(requests[0]?.from).toBe(endTimeMs - 2 * 60 * 60 * 1000);
  });

  it("paginates when exchange caps rows per response", async () => {
    const requests: Array<{ from: number; to: number; symbol: string; granularity: number }> = [];
    const hourMs = 60 * 60 * 1000;

    const provider = new KucoinKlineProvider({
      getKlines: async (query) => {
        requests.push(query);
        const from = Number(query.from);

        return {
          data: [
            [from, "100", "101", "99", "100.5", "10"],
            [from + hourMs, "100.5", "101.5", "99.5", "101", "12"],
          ],
        }.data;
      },
    } as KucoinClient);

    const endTimeMs = 1_700_000_000_000;
    const candles = await provider.fetchKlines({
      symbol: "XBTUSDTM",
      timeframe: "1h",
      limit: 5,
      endTimeMs,
    });

    expect(requests.length).toBeGreaterThan(1);
    expect(candles).toHaveLength(5);
    expect(candles[0]?.time).toBeLessThan(candles[4]?.time ?? 0);
  });
});
