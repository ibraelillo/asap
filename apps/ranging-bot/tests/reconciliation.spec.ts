import { describe, expect, it } from "vitest";
import { reconcileBotState } from "../src/reconciliation";
import type { BotRecord, PositionRecord } from "../src/monitoring/types";

const bot: BotRecord = {
  id: "bot-sol",
  name: "SOL bot",
  strategyId: "range-reversal",
  strategyVersion: "1",
  exchangeId: "kucoin",
  accountId: "acc-1",
  symbol: "SOLUSDTM",
  marketType: "perp",
  status: "active",
  execution: {
    trigger: "cron",
    executionTimeframe: "1h",
    warmupBars: 200,
  },
  context: {
    primaryPriceTimeframe: "1h",
    additionalTimeframes: ["4h", "1d"],
    providers: [],
  },
  riskProfileId: "default",
  strategyConfig: {},
  runtime: {
    executionTimeframe: "1h",
    executionLimit: 200,
    primaryRangeTimeframe: "1d",
    primaryRangeLimit: 90,
    secondaryRangeTimeframe: "4h",
    secondaryRangeLimit: 120,
  },
  createdAtMs: 1,
  updatedAtMs: 1,
};

const openPosition: PositionRecord = {
  id: "pos-1",
  botId: bot.id,
  botName: bot.name,
  strategyId: bot.strategyId,
  strategyVersion: bot.strategyVersion,
  exchangeId: bot.exchangeId,
  accountId: bot.accountId,
  symbol: bot.symbol,
  side: "long",
  status: "open",
  quantity: 2,
  remainingQuantity: 2,
  avgEntryPrice: 100,
  realizedPnl: 0,
  openedAtMs: 10,
  lastStrategyDecisionTimeMs: 10,
  lastExchangeSyncTimeMs: 10,
};

describe("reconciliation service", () => {
  it("marks a missing exchange match as drift", () => {
    const result = reconcileBotState({
      bot,
      localPosition: openPosition,
      exchangeSnapshots: [],
      nowMs: 1000,
    });

    expect(result.positions[0]?.status).toBe("reconciling");
    expect(result.events[0]).toMatchObject({
      status: "drift",
      positionId: openPosition.id,
    });
  });

  it("restores a reconciling position when exchange aligns", () => {
    const result = reconcileBotState({
      bot,
      localPosition: {
        ...openPosition,
        status: "reconciling",
      },
      exchangeSnapshots: [
        {
          symbol: bot.symbol,
          side: "long",
          quantity: 2,
          avgEntryPrice: 100,
          isOpen: true,
        },
      ],
      nowMs: 1000,
    });

    expect(result.positions[0]?.status).toBe("open");
    expect(result.events[0]).toMatchObject({
      status: "ok",
      positionId: openPosition.id,
    });
  });

  it("creates synthetic reconciling position for orphan exchange state", () => {
    const result = reconcileBotState({
      bot,
      localPosition: null,
      exchangeSnapshots: [
        {
          symbol: bot.symbol,
          side: "short",
          quantity: 1.5,
          avgEntryPrice: 98,
          isOpen: true,
        },
      ],
      nowMs: 1000,
    });

    expect(result.positions[0]).toMatchObject({
      side: "short",
      status: "reconciling",
      quantity: 1.5,
    });
    expect(result.events[0]).toMatchObject({
      status: "drift",
    });
  });
});
