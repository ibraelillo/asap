import { describe, expect, it } from "vitest";
import type { BotRecord } from "../src/monitoring/types";
import { strategyRegistry } from "../src/strategy-registry";

const baseBot: BotRecord = {
  id: "kucoin-main-range-sui",
  name: "SUIUSDTM",
  strategyId: "range-reversal",
  strategyVersion: "1",
  exchangeId: "kucoin",
  accountId: "kucoin-main",
  symbol: "SUIUSDTM",
  marketType: "futures",
  status: "active",
  execution: {
    trigger: "cron",
    executionTimeframe: "1h",
    warmupBars: 240,
  },
  context: {
    primaryPriceTimeframe: "1h",
    additionalTimeframes: ["1d", "4h"],
    providers: [],
  },
  riskProfileId: "risk:sui",
  strategyConfig: {},
  createdAtMs: 1,
  updatedAtMs: 1,
  runtime: {
    executionTimeframe: "1h",
    executionLimit: 240,
    primaryRangeTimeframe: "1d",
    primaryRangeLimit: 90,
    secondaryRangeTimeframe: "4h",
    secondaryRangeLimit: 180,
    dryRun: true,
  },
};

describe("strategy feed declarations", () => {
  it("declares range-reversal candle and indicator requirements", () => {
    const resolved = strategyRegistry.get(baseBot);
    const requirements = resolved.manifest.requiredFeeds({
      bot: baseBot,
      config: resolved.config,
    });

    expect(requirements.candles.map((entry) => entry.role)).toEqual([
      "execution",
      "primaryRange",
      "secondaryRange",
    ]);
    expect(requirements.candles.map((entry) => entry.timeframe)).toEqual([
      "1h",
      "1d",
      "4h",
    ]);
    expect(requirements.indicators.map((entry) => entry.indicatorId)).toEqual([
      "wavetrend",
      "moneyflow",
    ]);
  });

  it("declares indicator-bot candle and indicator requirements", () => {
    const indicatorBot: BotRecord = {
      ...baseBot,
      id: "kucoin-main-indicator-sui",
      strategyId: "indicator-bot",
      runtime: {
        ...baseBot.runtime,
        primaryRangeTimeframe: "4h",
        secondaryRangeTimeframe: "1d",
      },
      strategyConfig: {
        trend: {
          fastEmaLength: 21,
          slowEmaLength: 55,
          higherTimeframeEmaLength: 100,
        },
        momentum: {
          rsiLength: 14,
        },
        volatility: {
          atrLength: 14,
        },
        confirmation: {
          volumeSmaLength: 20,
        },
      },
    };

    const resolved = strategyRegistry.get(indicatorBot);
    const requirements = resolved.manifest.requiredFeeds({
      bot: indicatorBot,
      config: resolved.config,
    });

    expect(requirements.candles.map((entry) => entry.role)).toEqual([
      "execution",
      "primaryTrend",
      "secondaryTrend",
    ]);
    expect(requirements.indicators.map((entry) => entry.indicatorId)).toEqual([
      "ema",
      "ema",
      "ema",
      "ema",
      "rsi",
      "atr",
      "sma",
    ]);
  });
});
