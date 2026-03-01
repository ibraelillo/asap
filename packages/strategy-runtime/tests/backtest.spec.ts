import { z } from "zod";
import { describe, expect, it } from "vitest";
import { DecisionContextSchema, type DecisionContext } from "@repo/market-context";
import {
  StrategyBacktestMetricsSchema,
  StrategyBacktestOptionsSchema,
  StrategyDeploymentSchema,
  type StrategyDecision,
  type StrategyDefinition,
  type StrategyPackage,
} from "@repo/trading-core";
import { runStrategyBacktest } from "../src/backtest";

const demoStrategy: StrategyDefinition<
  Record<string, unknown>,
  DecisionContext,
  StrategyDecision
> = {
  id: "demo-range",
  version: "1",
  configSchema: z.record(z.string(), z.unknown()),
  contextSchema: DecisionContextSchema,
  decisionSchema: z.object({
    action: z.enum(["trade", "hold", "avoid", "exit"]),
    direction: z.enum(["long", "short"]).optional(),
    confidence: z.number().min(0).max(1).optional(),
    reasons: z.array(z.string()).default([]),
    recommendations: z.record(z.string(), z.unknown()).optional(),
  }),
  decide: ({ context }) => {
    const execution = context.contexts[context.executionTimeframe];
    const rsi = Number(
      (execution?.indicators.rsi as { value?: number } | undefined)?.value ?? 50,
    );

    if (rsi < 35) {
      return {
        action: "trade",
        direction: "long",
        confidence: 0.85,
        reasons: ["oversold"],
      };
    }

    return {
      action: "hold",
      reasons: ["no_edge"],
    };
  },
};

function makeContext(rsi: number, decisionTime: number): DecisionContext {
  return {
    symbol: "BTCUSDTM",
    decisionTime,
    executionTimeframe: "15m",
    contexts: {
      "15m": {
        symbol: "BTCUSDTM",
        timeframe: "15m",
        closedCandleTime: decisionTime,
        price: 100,
        candles: [],
        indicators: {
          rsi: { value: rsi },
        },
        divergences: {},
        patterns: {},
        levels: {},
        contextVersion: "context-v1",
      },
    },
  };
}

const demoStrategyPackage: StrategyPackage<
  Record<string, unknown>,
  DecisionContext,
  StrategyDecision,
  { id: string; side?: "long" | "short"; netPnl: number; entryTime?: number; closeTime?: number },
  { rawTradeCount: number }
> = {
  definition: demoStrategy,
  tradeEngine: {
    run: ({ decisions }) => {
      const trades = decisions
        .filter((record) => record.decision.action === "trade")
        .map((record, index) => ({
          id: `trade-${index + 1}`,
          side: record.decision.direction,
          entryTime: record.event.decisionTime,
          closeTime: record.event.decisionTime,
          netPnl: 10,
        }));

      return {
        trades,
        metrics: StrategyBacktestMetricsSchema.parse({
          totalTrades: trades.length,
          wins: trades.length,
          losses: 0,
          winRate: trades.length > 0 ? 1 : 0,
          netPnl: trades.reduce((sum, trade) => sum + trade.netPnl, 0),
          grossProfit: trades.reduce((sum, trade) => sum + trade.netPnl, 0),
          grossLoss: 0,
          maxDrawdownPct: 0,
          endingEquity: 1000 + trades.reduce((sum, trade) => sum + trade.netPnl, 0),
        }),
        artifacts: {
          rawTradeCount: trades.length,
        },
      };
    },
  },
};

describe("strategy-runtime backtest runner", () => {
  it("replays decisions then delegates execution to the strategy trade engine", () => {
    const deployment = StrategyDeploymentSchema.parse({
      id: "demo-btc-15m",
      strategyId: "demo-range",
      strategyVersion: "1",
      symbolUniverse: ["BTCUSDTM"],
      executionTimeframe: "15m",
      requiredTimeframes: ["15m"],
      config: {},
    });

    const result = runStrategyBacktest({
      strategyPackage: demoStrategyPackage,
      request: {
        requestId: "bt-1",
        deployment,
        contexts: [
          makeContext(28, 1_700_000_000_000),
          makeContext(54, 1_700_000_900_000),
        ],
        options: StrategyBacktestOptionsSchema.parse({
          initialEquity: 1000,
        }),
      },
    });

    expect(result.strategyId).toBe("demo-range");
    expect(result.decisions).toHaveLength(2);
    expect(result.trades).toHaveLength(1);
    expect(result.metrics.endingEquity).toBe(1010);
    expect(result.artifacts?.rawTradeCount).toBe(1);
  });
});
