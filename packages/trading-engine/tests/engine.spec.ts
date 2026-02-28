import { describe, expect, it } from "vitest";
import {
  runBacktestEngine,
  type BacktestRequest,
  type BotDefinition,
  type Candle,
  type TradingStrategy,
} from "../src/index";

const bot: BotDefinition = {
  id: "bot-1",
  name: "Test Bot",
  strategyId: "test-strategy",
  strategyVersion: "1",
  exchangeId: "paper",
  accountId: "default",
  symbol: "TESTUSDT",
  marketType: "futures",
  status: "active",
  execution: {
    trigger: "cron",
    executionTimeframe: "1h",
    warmupBars: 10,
  },
  context: {
    primaryPriceTimeframe: "1h",
    additionalTimeframes: [],
    providers: [],
  },
  riskProfileId: "risk-1",
  strategyConfig: {},
  createdAtMs: 1,
  updatedAtMs: 1,
};

const request: BacktestRequest = {
  id: "bt-1",
  botId: bot.id,
  fromMs: 1,
  toMs: 2,
  chartTimeframe: "1h",
  initialEquity: 1000,
  slippageModel: { type: "none" },
  feeModel: { type: "fixed-rate", rate: 0 },
  createdAtMs: 1,
};

const candles: Candle[] = [
  { time: 1, open: 100, high: 101, low: 99, close: 100, volume: 10 },
  { time: 2, open: 100, high: 112, low: 99, close: 111, volume: 10 },
];

describe("trading engine", () => {
  it("executes a strategy with intents", () => {
    const strategy: TradingStrategy<Record<string, never>, { price: number }> = {
      id: "test-strategy",
      version: "1",
      buildSnapshot: ({ market }) => ({
        price: market.executionCandles[market.index]?.close ?? 0,
      }),
      evaluate: ({ bot, market, position, snapshot }) => {
        if (!position && market.index === 0) {
          return {
            snapshotTime: market.executionCandles[market.index]?.time ?? 0,
            reasons: ["entry"],
            intents: [
              {
                kind: "enter",
                botId: bot.id,
                strategyId: "test-strategy",
                time: market.executionCandles[market.index]?.time ?? 0,
                reasons: ["entry"],
                side: "long",
                entry: { type: "market" },
                risk: { stopPrice: 95 },
                management: {
                  takeProfits: [
                    {
                      id: "tp1",
                      label: "TP1",
                      price: 110,
                      sizeFraction: 1,
                    },
                  ],
                },
              },
            ],
            diagnostics: { price: snapshot.price },
          };
        }

        return {
          snapshotTime: market.executionCandles[market.index]?.time ?? 0,
          reasons: ["hold"],
          intents: [
            {
              kind: "hold",
              botId: bot.id,
              strategyId: "test-strategy",
              time: market.executionCandles[market.index]?.time ?? 0,
              reasons: ["hold"],
            },
          ],
        };
      },
    };

    const result = runBacktestEngine({
      request,
      bot,
      config: {},
      strategy,
      market: {
        executionCandles: candles,
        series: {},
      },
      positionSizer: () => ({ quantity: 1 }),
    });

    expect(result.metrics.totalTrades).toBe(1);
    expect(result.positions).toHaveLength(1);
    expect(result.fills.some((fill) => fill.reason === "tp")).toBe(true);
  });
});
