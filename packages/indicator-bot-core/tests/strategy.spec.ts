import { describe, expect, it } from "vitest";
import type { Candle } from "@repo/trading-engine";
import {
  createConfiguredIndicatorBotStrategy,
  runIndicatorBotBacktest,
} from "../src";

function makeExecutionCandles(): Candle[] {
  return [
    { time: 1, open: 100, high: 101, low: 99.5, close: 100, volume: 100 },
    { time: 2, open: 100.5, high: 102.5, low: 100.2, close: 102, volume: 110 },
    { time: 3, open: 102, high: 104.5, low: 101.8, close: 104, volume: 115 },
    { time: 4, open: 103.5, high: 105.5, low: 103.4, close: 105, volume: 120 },
    { time: 5, open: 104.5, high: 105, low: 103.2, close: 103.8, volume: 118 },
    { time: 6, open: 103.8, high: 105.2, low: 103.6, close: 105, volume: 126 },
    {
      time: 7,
      open: 105.4,
      high: 107.4,
      low: 105.1,
      close: 106.7,
      volume: 145,
    },
    {
      time: 8,
      open: 106.8,
      high: 109.1,
      low: 106.5,
      close: 108.2,
      volume: 160,
    },
    {
      time: 9,
      open: 108.1,
      high: 110.4,
      low: 107.9,
      close: 109.1,
      volume: 170,
    },
  ];
}

function makeHigherTimeframeCandles(direction: "long" | "short"): Candle[] {
  const closes =
    direction === "long" ? [98, 100, 102, 104, 106] : [106, 104, 102, 100, 98];
  return closes.map((close, index) => ({
    time: index + 1,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 200 + index * 20,
  }));
}

describe("indicator bot strategy", () => {
  it("exposes the strategy contract", () => {
    const strategy = createConfiguredIndicatorBotStrategy().strategy;
    expect(strategy.id).toBe("indicator-bot");
    expect(strategy.version).toBe("1");
  });

  it("emits a long entry when confluence aligns", () => {
    const configured = createConfiguredIndicatorBotStrategy({
      trend: {
        fastEmaLength: 2,
        slowEmaLength: 5,
        higherTimeframeEmaLength: 5,
        slopeLookbackBars: 1,
        minEmaSeparationPct: 0.001,
        maxPriceDistanceFromFastEmaPct: 0.05,
      },
      momentum: {
        rsiLength: 2,
        longThreshold: 55,
        longCeiling: 99,
        shortThreshold: 45,
        shortFloor: 5,
      },
      volatility: {
        atrLength: 2,
        stopAtrMultiple: 1.2,
      },
      volume: {
        requireExpansion: false,
        volumeSmaLength: 2,
        minVolumeRatio: 1,
      },
    });

    const executionCandles = makeExecutionCandles();
    const market = {
      executionCandles,
      index: executionCandles.length - 1,
      series: {
        primaryRange: makeHigherTimeframeCandles("long"),
        secondaryRange: makeHigherTimeframeCandles("long"),
      },
    };

    const snapshot = configured.strategy.buildSnapshot({
      bot: {
        id: "bot",
        name: "bot",
        strategyId: "indicator-bot",
        strategyVersion: "1",
        exchangeId: "paper",
        accountId: "default",
        symbol: "TESTUSDT",
        marketType: "futures",
        status: "active",
        execution: {
          trigger: "event",
          executionTimeframe: "1h",
          warmupBars: 0,
        },
        context: {
          primaryPriceTimeframe: "1h",
          additionalTimeframes: [],
          providers: [],
        },
        riskProfileId: "risk",
        strategyConfig: {},
        createdAtMs: 0,
        updatedAtMs: 0,
      },
      config: configured.config,
      market,
      position: null,
    });

    const decision = configured.strategy.evaluate({
      bot: {
        id: "bot",
        name: "bot",
        strategyId: "indicator-bot",
        strategyVersion: "1",
        exchangeId: "paper",
        accountId: "default",
        symbol: "TESTUSDT",
        marketType: "futures",
        status: "active",
        execution: {
          trigger: "event",
          executionTimeframe: "1h",
          warmupBars: 0,
        },
        context: {
          primaryPriceTimeframe: "1h",
          additionalTimeframes: [],
          providers: [],
        },
        riskProfileId: "risk",
        strategyConfig: {},
        createdAtMs: 0,
        updatedAtMs: 0,
      },
      config: configured.config,
      snapshot,
      market,
      position: null,
    });

    expect(snapshot.long.ready).toBe(true);
    expect(decision.intents[0]?.kind).toBe("enter");
    expect(
      decision.intents[0] && "side" in decision.intents[0]
        ? decision.intents[0].side
        : null,
    ).toBe("long");
  });

  it("stays flat when higher timeframe trend blocks the setup", () => {
    const configured = createConfiguredIndicatorBotStrategy({
      trend: {
        fastEmaLength: 2,
        slowEmaLength: 5,
        higherTimeframeEmaLength: 5,
        slopeLookbackBars: 1,
        minEmaSeparationPct: 0.001,
        maxPriceDistanceFromFastEmaPct: 0.02,
      },
      momentum: {
        rsiLength: 2,
        longThreshold: 55,
        longCeiling: 95,
        shortThreshold: 45,
        shortFloor: 5,
      },
      volatility: {
        atrLength: 2,
        stopAtrMultiple: 1.2,
      },
    });

    const executionCandles = makeExecutionCandles();
    const market = {
      executionCandles,
      index: executionCandles.length - 1,
      series: {
        primaryRange: makeHigherTimeframeCandles("short"),
        secondaryRange: makeHigherTimeframeCandles("short"),
      },
    };

    const snapshot = configured.strategy.buildSnapshot({
      bot: {
        id: "bot",
        name: "bot",
        strategyId: "indicator-bot",
        strategyVersion: "1",
        exchangeId: "paper",
        accountId: "default",
        symbol: "TESTUSDT",
        marketType: "futures",
        status: "active",
        execution: {
          trigger: "event",
          executionTimeframe: "1h",
          warmupBars: 0,
        },
        context: {
          primaryPriceTimeframe: "1h",
          additionalTimeframes: [],
          providers: [],
        },
        riskProfileId: "risk",
        strategyConfig: {},
        createdAtMs: 0,
        updatedAtMs: 0,
      },
      config: configured.config,
      market,
      position: null,
    });

    const decision = configured.strategy.evaluate({
      bot: {
        id: "bot",
        name: "bot",
        strategyId: "indicator-bot",
        strategyVersion: "1",
        exchangeId: "paper",
        accountId: "default",
        symbol: "TESTUSDT",
        marketType: "futures",
        status: "active",
        execution: {
          trigger: "event",
          executionTimeframe: "1h",
          warmupBars: 0,
        },
        context: {
          primaryPriceTimeframe: "1h",
          additionalTimeframes: [],
          providers: [],
        },
        riskProfileId: "risk",
        strategyConfig: {},
        createdAtMs: 0,
        updatedAtMs: 0,
      },
      config: configured.config,
      snapshot,
      market,
      position: null,
    });

    expect(snapshot.long.ready).toBe(false);
    expect(decision.intents[0]?.kind).toBe("hold");
    expect(decision.reasons).toContain("long_primary_trend_not_confirmed");
  });

  it("runs a deterministic backtest with real trades", () => {
    const configured = createConfiguredIndicatorBotStrategy({
      trend: {
        fastEmaLength: 2,
        slowEmaLength: 5,
        higherTimeframeEmaLength: 5,
        slopeLookbackBars: 1,
        minEmaSeparationPct: 0.001,
        maxPriceDistanceFromFastEmaPct: 0.02,
      },
      momentum: {
        rsiLength: 2,
        longThreshold: 55,
        longCeiling: 95,
        shortThreshold: 45,
        shortFloor: 5,
      },
      volatility: {
        atrLength: 2,
        stopAtrMultiple: 1.2,
      },
      risk: {
        riskPctPerTrade: 0.01,
        maxNotionalPctEquity: 1,
        tp1RewardMultiple: 1,
        tp2RewardMultiple: 2,
        tp1SizePct: 0.5,
        tp2SizePct: 0.5,
        moveStopToBreakevenOnTp1: true,
        cooldownBars: 1,
      },
    });

    const result = runIndicatorBotBacktest(
      {
        botId: "bt-indicator",
        symbol: "TESTUSDT",
        initialEquity: 1000,
        executionTimeframe: "1h",
        executionCandles: makeExecutionCandles(),
        primaryRangeCandles: makeHigherTimeframeCandles("long"),
        secondaryRangeCandles: makeHigherTimeframeCandles("long"),
      },
      configured.config,
    );

    expect(result.result.metrics.totalTrades).toBeGreaterThan(0);
    expect(result.trades.length).toBe(result.result.metrics.totalTrades);
    expect(result.trades[0]?.exits.length).toBeGreaterThan(0);
  });
});
