import { z } from "zod";
import { describe, expect, it } from "vitest";
import { DecisionContextSchema, type DecisionContext } from "@repo/market-context";
import { replayDeployment } from "../src/runtime";
import {
  StrategyDecisionSchema,
  StrategyDeploymentSchema,
  type StrategyDecision,
  type StrategyDefinition,
} from "@repo/trading-core";

const demoStrategy: StrategyDefinition<
  Record<string, unknown>,
  DecisionContext,
  StrategyDecision
> = {
  id: "demo-range",
  version: "1",
  configSchema: z.record(z.string(), z.unknown()),
  contextSchema: DecisionContextSchema,
  decisionSchema: StrategyDecisionSchema,
  decide: ({ context }) => {
    const execution = context.contexts[context.executionTimeframe];
    const rsi = Number(
      (execution?.indicators.rsi as { value?: number } | undefined)?.value ?? 50,
    );
    if (rsi < 35) {
      return {
        action: "trade",
        direction: "long",
        confidence: 0.8,
        reasons: ["oversold"],
        recommendations: {
          tp1: 110,
        },
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

describe("strategy runtime", () => {
  it("replays contexts through the same strategy contract", () => {
    const deployment = StrategyDeploymentSchema.parse({
      id: "demo-btc-15m",
      strategyId: "demo-range",
      strategyVersion: "1",
      symbolUniverse: ["BTCUSDTM"],
      executionTimeframe: "15m",
      requiredTimeframes: ["15m"],
      config: {},
    });

    const result = replayDeployment({
      strategy: demoStrategy,
      deployment,
      contexts: [
        makeContext(28, 1_700_000_000_000),
        makeContext(54, 1_700_000_900_000),
      ],
    });

    expect(result.decisions).toHaveLength(2);
    expect(result.decisions[0]?.decision.action).toBe("trade");
    expect(result.decisions[1]?.decision.action).toBe("hold");
    expect(result.decisions[0]?.event.contextSnapshot["15m"]).toBeTruthy();
  });
});
