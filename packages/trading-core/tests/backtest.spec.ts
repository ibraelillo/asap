import { describe, expect, it } from "vitest";
import {
  BacktestDecisionRecordSchema,
  BacktestTradeSummarySchema,
  StrategyBacktestEnvelopeSchema,
  StrategyBacktestMetricsSchema,
  StrategyBacktestResultEnvelopeSchema,
} from "../src/backtest";

describe("trading-core backtest contracts", () => {
  it("accepts a stable shared backtest envelope", () => {
    const envelope = StrategyBacktestEnvelopeSchema.parse({
      requestId: "bt-1",
      deployment: {
        id: "range-btc-4h-v1",
        strategyId: "range-reversal",
        strategyVersion: "1",
        symbolUniverse: ["BTCUSDTM"],
        executionTimeframe: "4h",
        requiredTimeframes: ["15m", "1h", "4h"],
        config: {
          riskPct: 0.01,
        },
      },
      options: {
        initialEquity: 1000,
        feeRate: 0.0006,
        slippageBps: 2,
      },
    });

    expect(envelope.requestId).toBe("bt-1");
    expect(envelope.options.initialEquity).toBe(1000);
  });

  it("validates normalized trade summaries", () => {
    const trade = BacktestTradeSummarySchema.parse({
      id: "trade-1",
      side: "long",
      entryTime: 1_700_000_000_000,
      closeTime: 1_700_000_900_000,
      netPnl: 42.5,
    });

    expect(trade.side).toBe("long");
    expect(trade.netPnl).toBe(42.5);
  });

  it("validates shared backtest metrics", () => {
    const metrics = StrategyBacktestMetricsSchema.parse({
      totalTrades: 10,
      wins: 6,
      losses: 4,
      winRate: 0.6,
      netPnl: 125.4,
      grossProfit: 180,
      grossLoss: 54.6,
      maxDrawdownPct: 0.08,
      endingEquity: 1125.4,
    });

    expect(metrics.endingEquity).toBeGreaterThan(1100);
  });

  it("records decision evidence for strategy trade engines", () => {
    const record = BacktestDecisionRecordSchema.parse({
      index: 0,
      event: {
        id: "decision-1",
        type: "strategy.decision.emitted",
        strategyId: "range-reversal",
        strategyVersion: "1",
        deploymentId: "range-btc-4h-v1",
        symbol: "BTCUSDTM",
        decisionTime: 1_700_000_000_000,
        contextRefs: {
          "4h": {
            exchangeId: "kucoin",
            symbol: "BTCUSDTM",
            timeframe: "4h",
            closedCandleTime: 1_700_000_000_000,
            contextVersion: "context-v1",
          },
        },
        contextSnapshot: {
          "4h": {
            indicators: { rsi: 31.2 },
          },
        },
        decision: {
          action: "trade",
          direction: "long",
          reasons: ["oversold"],
        },
      },
    });

    expect(record.event.decision.action).toBe("trade");
  });

  it("validates the final backtest result envelope", () => {
    const result = StrategyBacktestResultEnvelopeSchema.parse({
      requestId: "bt-1",
      deploymentId: "range-btc-4h-v1",
      strategyId: "range-reversal",
      strategyVersion: "1",
      metrics: {
        totalTrades: 1,
        wins: 1,
        losses: 0,
        winRate: 1,
        netPnl: 65,
        grossProfit: 65,
        grossLoss: 0,
        maxDrawdownPct: 0,
        endingEquity: 1065,
      },
      decisions: [
        {
          index: 0,
          event: {
            id: "decision-1",
            type: "strategy.decision.emitted",
            strategyId: "range-reversal",
            strategyVersion: "1",
            deploymentId: "range-btc-4h-v1",
            symbol: "BTCUSDTM",
            decisionTime: 1_700_000_000_000,
            contextRefs: {
              "4h": {
                exchangeId: "kucoin",
                symbol: "BTCUSDTM",
                timeframe: "4h",
                closedCandleTime: 1_700_000_000_000,
                contextVersion: "context-v1",
              },
            },
            contextSnapshot: {
              "4h": {
                indicators: { rsi: 31.2 },
              },
            },
            decision: {
              action: "trade",
              direction: "long",
              reasons: ["oversold"],
            },
          },
          decision: {
            action: "trade",
            direction: "long",
            reasons: ["oversold"],
          },
        },
      ],
    });

    expect(result.metrics.netPnl).toBe(65);
    expect(result.decisions).toHaveLength(1);
  });
});
