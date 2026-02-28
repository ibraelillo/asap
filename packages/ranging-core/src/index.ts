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
import type { StrategyDecision } from "@repo/trading-engine";
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
