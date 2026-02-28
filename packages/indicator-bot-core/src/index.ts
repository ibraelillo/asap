import type {
  StrategyAnalysisJsonSchema,
  StrategyAnalysisUiField,
  StrategyDecision,
} from "@repo/trading-engine";
import {
  createIndicatorBotConfig,
  defaultIndicatorBotConfig,
  indicatorBotConfigJsonSchema,
  indicatorBotConfigSchema,
  indicatorBotConfigUi,
} from "./config";
import { runIndicatorBotBacktest } from "./backtest";
import {
  buildIndicatorBotSnapshot,
  createIndicatorBotStrategy,
} from "./strategy";
import type {
  IndicatorBotConfig,
  IndicatorBotIntentMeta,
  IndicatorBotSnapshot,
} from "./types";

export * from "./types";
export * from "./config";
export * from "./indicators";
export * from "./strategy";
export * from "./backtest";

export interface ConfiguredIndicatorBotStrategy {
  config: IndicatorBotConfig;
  strategy: ReturnType<typeof createIndicatorBotStrategy>;
  buildSnapshot: ReturnType<typeof createIndicatorBotStrategy>["buildSnapshot"];
  runBacktest: (
    input: Parameters<typeof runIndicatorBotBacktest>[0],
    config?: IndicatorBotConfig,
  ) => ReturnType<typeof runIndicatorBotBacktest>;
}

export const indicatorBotAnalysisJsonSchema: StrategyAnalysisJsonSchema = {
  type: "object",
  properties: {
    signal: { type: ["string", "null"] },
    price: { type: "number" },
    trend: {
      type: "object",
      properties: {
        fastEma: { type: "number" },
        slowEma: { type: "number" },
        fastSlopePct: { type: "number" },
        emaSpreadPct: { type: "number" },
        primaryTrend: { type: "string" },
        secondaryTrend: { type: "string" },
      },
    },
    momentum: {
      type: "object",
      properties: {
        rsi: { type: "number" },
      },
    },
    volatility: {
      type: "object",
      properties: {
        atr: { type: "number" },
      },
    },
    volume: {
      type: "object",
      properties: {
        volumeRatio: { type: "number" },
      },
    },
    setups: {
      type: "object",
      properties: {
        long: {
          type: "object",
          properties: {
            ready: { type: "boolean" },
            reasons: { type: "array", items: { type: "string" } },
            blockers: { type: "array", items: { type: "string" } },
          },
        },
        short: {
          type: "object",
          properties: {
            ready: { type: "boolean" },
            reasons: { type: "array", items: { type: "string" } },
            blockers: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
};

export const indicatorBotAnalysisUi: StrategyAnalysisUiField[] = [
  {
    path: "signal",
    widget: "text",
    label: "Signal Bias",
    section: "Decision",
    order: 1,
  },
  {
    path: "price",
    widget: "number",
    label: "Price",
    section: "Decision",
    order: 2,
    decimals: 4,
  },
  {
    path: "trend.fastEma",
    widget: "number",
    label: "Fast EMA",
    section: "Trend",
    order: 10,
    decimals: 4,
  },
  {
    path: "trend.slowEma",
    widget: "number",
    label: "Slow EMA",
    section: "Trend",
    order: 11,
    decimals: 4,
  },
  {
    path: "trend.fastSlopePct",
    widget: "number",
    label: "Fast Slope",
    section: "Trend",
    order: 12,
    valueFormat: "fraction-percent",
    suffix: "%",
    decimals: 2,
  },
  {
    path: "trend.emaSpreadPct",
    widget: "number",
    label: "EMA Spread",
    section: "Trend",
    order: 13,
    valueFormat: "fraction-percent",
    suffix: "%",
    decimals: 2,
  },
  {
    path: "trend.primaryTrend",
    widget: "text",
    label: "Primary Trend",
    section: "Trend",
    order: 14,
  },
  {
    path: "trend.secondaryTrend",
    widget: "text",
    label: "Secondary Trend",
    section: "Trend",
    order: 15,
  },
  {
    path: "momentum.rsi",
    widget: "number",
    label: "RSI",
    section: "Momentum",
    order: 20,
    decimals: 2,
  },
  {
    path: "volatility.atr",
    widget: "number",
    label: "ATR",
    section: "Volatility",
    order: 30,
    decimals: 4,
  },
  {
    path: "volume.volumeRatio",
    widget: "number",
    label: "Volume Ratio",
    section: "Volume",
    order: 40,
    decimals: 2,
  },
  {
    path: "setups.long.ready",
    widget: "boolean",
    label: "Long Ready",
    section: "Long Setup",
    order: 50,
  },
  {
    path: "setups.long.reasons",
    widget: "string-array",
    label: "Long Reasons",
    section: "Long Setup",
    order: 51,
  },
  {
    path: "setups.long.blockers",
    widget: "string-array",
    label: "Long Blockers",
    section: "Long Setup",
    order: 52,
  },
  {
    path: "setups.short.ready",
    widget: "boolean",
    label: "Short Ready",
    section: "Short Setup",
    order: 60,
  },
  {
    path: "setups.short.reasons",
    widget: "string-array",
    label: "Short Reasons",
    section: "Short Setup",
    order: 61,
  },
  {
    path: "setups.short.blockers",
    widget: "string-array",
    label: "Short Blockers",
    section: "Short Setup",
    order: 62,
  },
];

export function buildIndicatorBotAnalysis(input: {
  snapshot: IndicatorBotSnapshot;
  decision: StrategyDecision<IndicatorBotIntentMeta>;
}): Record<string, unknown> {
  const signal =
    input.decision.intents.find((intent) => intent.kind === "enter")?.side ??
    null;

  return {
    signal,
    price: input.snapshot.price,
    trend: {
      fastEma: input.snapshot.fastEma,
      slowEma: input.snapshot.slowEma,
      fastSlopePct: input.snapshot.fastSlopePct,
      emaSpreadPct: input.snapshot.emaSpreadPct,
      primaryTrend: input.snapshot.primaryTrend,
      secondaryTrend: input.snapshot.secondaryTrend,
    },
    momentum: {
      rsi: input.snapshot.rsi,
    },
    volatility: {
      atr: input.snapshot.atr,
    },
    volume: {
      volumeRatio: input.snapshot.volumeRatio,
    },
    setups: {
      long: {
        ready: input.snapshot.long.ready,
        reasons: input.snapshot.long.reasons,
        blockers: input.snapshot.long.blockers,
      },
      short: {
        ready: input.snapshot.short.ready,
        reasons: input.snapshot.short.reasons,
        blockers: input.snapshot.short.blockers,
      },
    },
  };
}

export function createConfiguredIndicatorBotStrategy(
  config?: Partial<IndicatorBotConfig>,
): ConfiguredIndicatorBotStrategy {
  const resolvedConfig = createIndicatorBotConfig(config);
  const strategy = createIndicatorBotStrategy(resolvedConfig);

  return {
    config: resolvedConfig,
    strategy,
    buildSnapshot: strategy.buildSnapshot,
    runBacktest: (input, overrides = resolvedConfig) =>
      runIndicatorBotBacktest(input, overrides),
  };
}

export {
  buildIndicatorBotSnapshot,
  createIndicatorBotConfig,
  createIndicatorBotStrategy,
};
export const indicatorBotDefaults = defaultIndicatorBotConfig;
export {
  indicatorBotConfigJsonSchema,
  indicatorBotConfigSchema,
  indicatorBotConfigUi,
};
