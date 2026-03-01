import { describe, expect, it } from "vitest";
import {
  StrategyDeploymentSchema,
  TimeframeSchema,
  StrategyDecisionSchema,
} from "../src/contracts";
import { createDecisionEvent, DecisionEventSchema } from "../src/events";

describe("trading-core contracts", () => {
  it("accepts valid strategy deployments", () => {
    const deployment = StrategyDeploymentSchema.parse({
      id: "range-btc-4h-v1",
      strategyId: "range-reversal",
      strategyVersion: "1",
      symbolUniverse: ["BTCUSDTM"],
      executionTimeframe: "4h",
      requiredTimeframes: ["15m", "1h", "4h"],
      config: {
        riskPct: 0.01,
      },
    });

    expect(deployment.executionTimeframe).toBe("4h");
    expect(deployment.requiredTimeframes).toContain("15m");
  });

  it("rejects unsupported timeframes", () => {
    expect(() => TimeframeSchema.parse("3m")).toThrow();
  });

  it("creates decision events with copied decision payloads", () => {
    const decision = StrategyDecisionSchema.parse({
      action: "trade",
      direction: "long",
      confidence: 0.82,
      reasons: ["bullish_divergence", "hammer"],
      recommendations: {
        tp1: { kind: "fibo", value: 86120 },
      },
    });

    const event = createDecisionEvent({
      id: "decision-1",
      strategyId: "range-reversal",
      strategyVersion: "1",
      deploymentId: "range-btc-4h-v1",
      symbol: "BTCUSDTM",
      decisionTime: 1772313000000,
      contextRefs: {
        "15m": {
          exchangeId: "kucoin",
          symbol: "BTCUSDTM",
          timeframe: "15m",
          closedCandleTime: 1772313000000,
          contextVersion: "context-v1",
        },
      },
      contextSnapshot: {
        "15m": {
          indicators: { rsi: 31.2 },
        },
      },
      decision,
    });

    expect(DecisionEventSchema.parse(event).type).toBe(
      "strategy.decision.emitted",
    );
    expect(event.decision.direction).toBe("long");
    expect(event.contextRefs["15m"]?.timeframe).toBe("15m");
  });
});
