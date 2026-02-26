import { runBacktest } from "./backtest";
import { createConfig, defaultRangeReversalConfig } from "./config";
import {
  buildSignalSnapshot,
  evaluateEntry,
  resolveTakeProfitLevels,
  type SignalSnapshotInput,
} from "./strategy";
import type {
  BacktestInput,
  DeepPartial,
  EntryDecision,
  RangeReversalConfig,
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

export interface RangingBotApi {
  config: RangeReversalConfig;
  buildSignalSnapshot: (input: Omit<SignalSnapshotInput, "config">) => SignalSnapshot;
  evaluateEntry: (snapshot: SignalSnapshot) => EntryDecision;
  runBacktest: (input: BacktestInput) => ReturnType<typeof runBacktest>;
}

export function createRangingBot(overrides?: DeepPartial<RangeReversalConfig>): RangingBotApi {
  const config = createConfig(overrides);

  return {
    config,
    buildSignalSnapshot: (input) => buildSignalSnapshot({ ...input, config }),
    evaluateEntry: (snapshot) => evaluateEntry(snapshot, config),
    runBacktest: (input) => runBacktest(input, config),
  };
}

export const rangingBotDefaults = defaultRangeReversalConfig;
export { resolveTakeProfitLevels };
