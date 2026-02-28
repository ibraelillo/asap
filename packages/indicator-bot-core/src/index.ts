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
import type { IndicatorBotConfig } from "./types";

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
