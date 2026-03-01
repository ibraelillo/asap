import { describe, expect, it } from "vitest";
import type { Candle } from "@repo/trading-core";
import { LocalIndicatorProvider } from "../src/local-indicator-provider";
import { aggregateDecisionContext, buildTimeframeContext } from "../src/context-builder";

function buildCandles(count: number, start = 100): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const open = start + index * 0.8;
    const close = open + (index % 2 === 0 ? 1.2 : -0.3);
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - (index === count - 1 ? 4 : 0.6);
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

describe("market context", () => {
  it("builds a storable timeframe context with indicators and features", () => {
    const provider = new LocalIndicatorProvider();
    const candles = buildCandles(24);

    const context = buildTimeframeContext({
      symbol: "BTCUSDTM",
      timeframe: "15m",
      candles,
      indicatorProvider: provider,
      indicatorRequests: [
        { indicatorId: "rsi", params: { length: 14 } },
        { indicatorId: "mfi", params: { length: 14 } },
        { indicatorId: "wavetrend", params: { channelLength: 10, averageLength: 21 } },
        { indicatorId: "ema", params: { length: 20 } },
        { indicatorId: "sma", params: { length: 20 } },
        { indicatorId: "fibonacciretracement", params: {} },
      ],
    });

    expect(context.indicators.rsi).toBeTruthy();
    expect(context.patterns.hammer).toBeTypeOf("boolean");
    expect(context.divergences.rsiBullish).toBeTypeOf("boolean");
    expect(context.levels.fibonacciretracement).toBeTruthy();
    expect(JSON.parse(JSON.stringify(context)).symbol).toBe("BTCUSDTM");
  });

  it("aggregates multiple timeframe contexts into a decision context", () => {
    const provider = new LocalIndicatorProvider();
    const context15m = buildTimeframeContext({
      symbol: "BTCUSDTM",
      timeframe: "15m",
      candles: buildCandles(24),
      indicatorProvider: provider,
      indicatorRequests: [{ indicatorId: "rsi", params: { length: 14 } }],
    });
    const context1h = buildTimeframeContext({
      symbol: "BTCUSDTM",
      timeframe: "1h",
      candles: buildCandles(24, 200),
      indicatorProvider: provider,
      indicatorRequests: [{ indicatorId: "ema", params: { length: 20 } }],
    });

    const aggregated = aggregateDecisionContext({
      symbol: "BTCUSDTM",
      decisionTime: context15m.closedCandleTime,
      executionTimeframe: "15m",
      contexts: {
        "15m": context15m,
        "1h": context1h,
      },
    });

    expect(aggregated.contexts["15m"]?.timeframe).toBe("15m");
    expect(aggregated.contexts["1h"]?.timeframe).toBe("1h");
  });
});
