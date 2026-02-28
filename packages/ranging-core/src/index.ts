import { runBacktest } from "./backtest";
import { createConfig, defaultRangeReversalConfig } from "./config";
import {
  buildSignalSnapshot,
  buildRangeReversalDecision,
  createRangeReversalStrategy,
  evaluateEntry,
  resolveTakeProfitLevels,
  type SignalSnapshotInput,
} from "./strategy";
import type {
  BacktestInput,
  DeepPartial,
  EntryDecision,
  RangeReversalConfig,
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

/** @deprecated prefer createRangeReversalStrategy */
export function createRangingBot(
  overrides?: DeepPartial<RangeReversalConfig>,
): RangingBotApi {
  const config = createConfig(overrides);

  return {
    config,
    buildSignalSnapshot: (input) => buildSignalSnapshot({ ...input, config }),
    evaluateEntry: (snapshot) => evaluateEntry(snapshot, config),
    runBacktest: (input) => runBacktest(input, config),
  };
}

export function createConfiguredRangeReversalStrategy(
  overrides?: DeepPartial<RangeReversalConfig>,
) {
  const config = createConfig(overrides);
  return {
    config,
    strategy: createRangeReversalStrategy(config),
  };
}

export type { RangeReversalSnapshot, SignalSnapshotInput };
export const rangingBotDefaults = defaultRangeReversalConfig;
export {
  buildRangeReversalDecision,
  createRangeReversalStrategy,
  resolveTakeProfitLevels,
};
