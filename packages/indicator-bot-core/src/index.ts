import type {
  StrategyEvaluationInput,
  StrategySnapshotInput,
  TradingStrategy,
} from "@repo/trading-engine";

export interface IndicatorBotConfig {
  indicators: string[];
}

export interface IndicatorBotSnapshot {
  time: number;
  price: number;
}

function normalizeConfig(
  config?: Partial<IndicatorBotConfig>,
): IndicatorBotConfig {
  return {
    indicators: Array.isArray(config?.indicators)
      ? config.indicators.filter(
          (indicator): indicator is string => typeof indicator === "string",
        )
      : [],
  };
}

export function createIndicatorBotStrategy(
  config?: Partial<IndicatorBotConfig>,
): TradingStrategy<IndicatorBotConfig, IndicatorBotSnapshot> {
  return createConfiguredIndicatorBotStrategy(config).strategy;
}

export function createConfiguredIndicatorBotStrategy(
  config?: Partial<IndicatorBotConfig>,
) {
  const resolved = normalizeConfig(config);
  const strategy: TradingStrategy<IndicatorBotConfig, IndicatorBotSnapshot> = {
    id: "indicator-bot",
    version: "1",
    buildSnapshot: ({
      market,
    }: StrategySnapshotInput<IndicatorBotConfig>): IndicatorBotSnapshot => ({
      time: market.executionCandles[market.index]?.time ?? 0,
      price: market.executionCandles[market.index]?.close ?? 0,
    }),
    evaluate: ({
      bot,
      snapshot,
    }: StrategyEvaluationInput<IndicatorBotConfig, IndicatorBotSnapshot>) => ({
      snapshotTime: snapshot.time,
      reasons: ["indicator_bot_scaffold"],
      intents: [
        {
          kind: "hold" as const,
          botId: bot.id,
          strategyId: "indicator-bot",
          time: snapshot.time,
          reasons: ["indicator_bot_scaffold"],
        },
      ],
      diagnostics: {
        price: snapshot.price,
        indicators: resolved.indicators,
      },
    }),
  };

  return {
    config: resolved,
    strategy,
  };
}
