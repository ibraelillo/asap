import {
  createConfig,
  createRangeReversalStrategy,
  type DeepPartial,
  type RangeReversalConfig,
} from "@repo/ranging-core";
import type { TradingStrategy } from "@repo/trading-engine";
import type { BotRecord } from "./monitoring/types";

export interface ResolvedStrategy<
  TConfig = unknown,
  TSnapshot = unknown,
  TMeta = unknown,
> {
  config: TConfig;
  strategy: TradingStrategy<TConfig, TSnapshot, TMeta>;
}

export interface StrategyRegistry {
  get(bot: BotRecord): ResolvedStrategy;
}

function resolveRangeReversal(
  bot: BotRecord,
): ResolvedStrategy<RangeReversalConfig> {
  const overrides = (bot.strategyConfig ??
    {}) as DeepPartial<RangeReversalConfig>;
  const config = createConfig(overrides);
  return {
    config,
    strategy: createRangeReversalStrategy(config),
  };
}

export const strategyRegistry: StrategyRegistry = {
  get(bot) {
    if (bot.strategyId === "range-reversal") {
      return resolveRangeReversal(bot);
    }

    throw new Error(`Unsupported strategy: ${bot.strategyId}`);
  },
};
