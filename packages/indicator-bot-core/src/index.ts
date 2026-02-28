import type { TradingStrategy } from "@repo/trading-engine";

export interface IndicatorBotConfig {
  indicators: string[];
}

export interface IndicatorBotSnapshot {
  time: number;
  price: number;
}

export function createIndicatorBotStrategy(): TradingStrategy<IndicatorBotConfig, IndicatorBotSnapshot> {
  return {
    id: "indicator-bot",
    version: "1",
    buildSnapshot: ({ market }) => ({
      time: market.executionCandles[market.index]?.time ?? 0,
      price: market.executionCandles[market.index]?.close ?? 0,
    }),
    evaluate: ({ bot, snapshot }) => ({
      snapshotTime: snapshot.time,
      reasons: ["indicator_bot_scaffold"],
      intents: [
        {
          kind: "hold",
          botId: bot.id,
          strategyId: "indicator-bot",
          time: snapshot.time,
          reasons: ["indicator_bot_scaffold"],
        },
      ],
      diagnostics: {
        price: snapshot.price,
      },
    }),
  };
}
