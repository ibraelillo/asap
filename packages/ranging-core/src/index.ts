import { runBacktest } from "./backtest";
import {
  createConfig,
  defaultRangeReversalConfig,
  rangeReversalConfigJsonSchema,
  rangeReversalConfigSchema,
  rangeReversalConfigUi,
} from "./config";
import {
  buildSignalSnapshot,
  buildRangeReversalDecision,
  createRangeReversalStrategy,
  evaluateEntry,
  resolveTakeProfitLevels,
  type SignalSnapshotInput,
} from "./strategy";
import type {
  StrategyAnalysisJsonSchema,
  StrategyAnalysisUiField,
  StrategyDecision,
} from "@repo/trading-engine";
import type {
  BacktestInput,
  DeepPartial,
  EntryDecision,
  RangeReversalConfig,
  RangeReversalIntentMeta,
  RangeReversalSnapshot,
  SignalSnapshot,
} from "./types";

export * from "./types";
export * from "./backtest";
export * from "./strategy";
export * from "./analysis/indicators";
export * from "./analysis/range";
export * from "./analysis/signals";
export * from "./risk";
export * from "./config";

/** @deprecated prefer createRangeReversalStrategy */
export interface RangingBotApi {
  config: RangeReversalConfig;
  buildSignalSnapshot: (
    input: Omit<SignalSnapshotInput, "config">,
  ) => SignalSnapshot;
  evaluateEntry: (snapshot: SignalSnapshot) => EntryDecision;
  runBacktest: (input: BacktestInput) => ReturnType<typeof runBacktest>;
}

export interface ConfiguredRangeReversalStrategy {
  config: RangeReversalConfig;
  strategy: ReturnType<typeof createRangeReversalStrategy>;
  buildSignalSnapshot: (
    input: Omit<SignalSnapshotInput, "config">,
  ) => SignalSnapshot;
  evaluateEntry: (snapshot: SignalSnapshot) => EntryDecision;
  buildDecision: (input: {
    botId: string;
    strategyId?: string;
    snapshot: RangeReversalSnapshot;
    executionCandle: SignalSnapshotInput["executionCandles"][number];
    position: Parameters<typeof buildRangeReversalDecision>[0]["position"];
  }) => StrategyDecision<RangeReversalIntentMeta>;
  runBacktest: (input: BacktestInput) => ReturnType<typeof runBacktest>;
}

export const rangeReversalAnalysisJsonSchema: StrategyAnalysisJsonSchema = {
  type: "object",
  properties: {
    signal: { type: ["string", "null"] },
    price: { type: "number" },
    range: {
      type: "object",
      properties: {
        val: { type: "number" },
        poc: { type: "number" },
        vah: { type: "number" },
        isAligned: { type: "boolean" },
        overlapRatio: { type: "number" },
      },
    },
    confirmations: {
      type: "object",
      properties: {
        bullishDivergence: { type: "boolean" },
        bearishDivergence: { type: "boolean" },
        bullishSfp: { type: "boolean" },
        bearishSfp: { type: "boolean" },
        moneyFlowSlope: { type: "number" },
        recentLowBrokeVal: { type: "boolean" },
        recentHighBrokeVah: { type: "boolean" },
      },
    },
    blockers: {
      type: "object",
      properties: {
        long: { type: "array", items: { type: "string" } },
        short: { type: "array", items: { type: "string" } },
      },
    },
  },
};

export const rangeReversalAnalysisUi: StrategyAnalysisUiField[] = [
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
    path: "range.val",
    widget: "number",
    label: "VAL",
    section: "Range",
    order: 10,
    decimals: 4,
  },
  {
    path: "range.poc",
    widget: "number",
    label: "POC",
    section: "Range",
    order: 11,
    decimals: 4,
  },
  {
    path: "range.vah",
    widget: "number",
    label: "VAH",
    section: "Range",
    order: 12,
    decimals: 4,
  },
  {
    path: "range.isAligned",
    widget: "boolean",
    label: "Aligned",
    section: "Range",
    order: 13,
  },
  {
    path: "range.overlapRatio",
    widget: "number",
    label: "Overlap Ratio",
    section: "Range",
    order: 14,
    valueFormat: "fraction-percent",
    suffix: "%",
    decimals: 1,
  },
  {
    path: "confirmations.moneyFlowSlope",
    widget: "number",
    label: "Money Flow Slope",
    section: "Confirmations",
    order: 20,
    decimals: 4,
  },
  {
    path: "confirmations.bullishDivergence",
    widget: "boolean",
    label: "Bullish Divergence",
    section: "Confirmations",
    order: 21,
  },
  {
    path: "confirmations.bearishDivergence",
    widget: "boolean",
    label: "Bearish Divergence",
    section: "Confirmations",
    order: 22,
  },
  {
    path: "confirmations.bullishSfp",
    widget: "boolean",
    label: "Bullish SFP",
    section: "Confirmations",
    order: 23,
  },
  {
    path: "confirmations.bearishSfp",
    widget: "boolean",
    label: "Bearish SFP",
    section: "Confirmations",
    order: 24,
  },
  {
    path: "confirmations.recentLowBrokeVal",
    widget: "boolean",
    label: "Recent VAL Sweep",
    section: "Confirmations",
    order: 25,
  },
  {
    path: "confirmations.recentHighBrokeVah",
    widget: "boolean",
    label: "Recent VAH Sweep",
    section: "Confirmations",
    order: 26,
  },
  {
    path: "blockers.long",
    widget: "string-array",
    label: "Long Blockers",
    section: "Blockers",
    order: 30,
  },
  {
    path: "blockers.short",
    widget: "string-array",
    label: "Short Blockers",
    section: "Blockers",
    order: 31,
  },
];

export function buildRangeReversalAnalysis(input: {
  snapshot: RangeReversalSnapshot;
  decision: StrategyDecision<RangeReversalIntentMeta>;
}): Record<string, unknown> {
  const diagnostics = (input.decision.diagnostics ?? {}) as {
    signal?: "long" | "short" | null;
    failedLongReasons?: string[];
    failedShortReasons?: string[];
  };

  return {
    signal: diagnostics.signal ?? null,
    price: input.snapshot.price,
    range: {
      val: input.snapshot.range.effective.val,
      poc: input.snapshot.range.effective.poc,
      vah: input.snapshot.range.effective.vah,
      isAligned: input.snapshot.range.isAligned,
      overlapRatio: input.snapshot.range.overlapRatio,
    },
    confirmations: {
      bullishDivergence: input.snapshot.bullishDivergence,
      bearishDivergence: input.snapshot.bearishDivergence,
      bullishSfp: input.snapshot.bullishSfp,
      bearishSfp: input.snapshot.bearishSfp,
      moneyFlowSlope: input.snapshot.moneyFlowSlope,
      recentLowBrokeVal: input.snapshot.recentLowBrokeVal,
      recentHighBrokeVah: input.snapshot.recentHighBrokeVah,
    },
    blockers: {
      long: diagnostics.failedLongReasons ?? [],
      short: diagnostics.failedShortReasons ?? [],
    },
  };
}

/** @deprecated prefer createRangeReversalStrategy */
export function createRangingBot(
  overrides?: DeepPartial<RangeReversalConfig>,
): RangingBotApi {
  const configured = createConfiguredRangeReversalStrategy(overrides);

  return {
    config: configured.config,
    buildSignalSnapshot: configured.buildSignalSnapshot,
    evaluateEntry: configured.evaluateEntry,
    runBacktest: configured.runBacktest,
  };
}

export function createConfiguredRangeReversalStrategy(
  overrides?: DeepPartial<RangeReversalConfig>,
): ConfiguredRangeReversalStrategy {
  const config = createConfig(overrides);
  const strategy = createRangeReversalStrategy(config);

  return {
    config,
    strategy,
    buildSignalSnapshot: (input) => buildSignalSnapshot({ ...input, config }),
    evaluateEntry: (snapshot) => evaluateEntry(snapshot, config),
    buildDecision: (input) =>
      buildRangeReversalDecision({
        botId: input.botId,
        strategyId: input.strategyId,
        snapshot: input.snapshot,
        config,
        executionCandle: input.executionCandle,
        position: input.position,
      }),
    runBacktest: (input) => runBacktest(input, config),
  };
}

export type { RangeReversalSnapshot, SignalSnapshotInput };
export const rangingBotDefaults = defaultRangeReversalConfig;
export {
  buildRangeReversalDecision,
  createRangeReversalStrategy,
  rangeReversalConfigJsonSchema,
  rangeReversalConfigSchema,
  rangeReversalConfigUi,
  resolveTakeProfitLevels,
};
