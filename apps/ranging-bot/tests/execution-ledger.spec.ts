import { describe, expect, it } from "vitest";
import type { SignalProcessingResult } from "@repo/trading-engine";
import {
  buildFillRecords,
  buildOrderRecord,
  buildReconciliationEventRecord,
  reconcilePositionRecord,
} from "../src/execution-ledger";
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
  stopPrice: 95,
  realizedPnl: 0,
  openedAtMs: 10,
  lastStrategyDecisionTimeMs: 10,
  lastExchangeSyncTimeMs: 10,
};

describe("execution ledger helpers", () => {
  it("creates open position, order, fill and reconciliation for confirmed entry", () => {
    const processing: SignalProcessingResult = {
      status: "order-submitted",
      side: "long",
      order: {
        purpose: "entry",
        status: "filled",
        requestedValueQty: "150",
        executedPrice: 101.25,
        executedQuantity: 1.48,
        externalOrderId: "ext-1",
        clientOid: "cli-1",
      },
      positionSnapshot: {
        symbol: bot.symbol,
        side: "long",
        quantity: 1.48,
        avgEntryPrice: 101.25,
        isOpen: true,
      },
      reconciliation: {
        status: "ok",
        message: "entry_confirmed",
      },
    };

    const position = reconcilePositionRecord(bot, null, processing, 1000);
    const order = buildOrderRecord(bot, position ?? null, processing, 1000);
    const fills = buildFillRecords(bot, position ?? null, processing, 1000);
    const reconciliation = buildReconciliationEventRecord(
      bot,
      position ?? null,
      processing,
      1000,
    );

    expect(position).toMatchObject({
      status: "open",
      quantity: 1.48,
      avgEntryPrice: 101.25,
    });
    expect(order).toMatchObject({
      purpose: "entry",
      status: "filled",
      requestedValueQty: "150",
      executedQuantity: 1.48,
    });
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({
      reason: "entry",
      source: "exchange-snapshot",
      quantity: 1.48,
      price: 101.25,
    });
    expect(reconciliation).toMatchObject({
      status: "ok",
      message: "entry_confirmed",
    });
  });

  it("marks a missing exchange position as reconciling drift", () => {
    const processing: SignalProcessingResult = {
      status: "no-signal",
      reconciliation: {
        status: "drift",
        message: "local_position_missing_on_exchange",
      },
    };

    const position = reconcilePositionRecord(
      bot,
      openPosition,
      processing,
      2000,
    );
    const reconciliation = buildReconciliationEventRecord(
      bot,
      openPosition,
      processing,
      2000,
    );

    expect(position?.status).toBe("reconciling");
    expect(reconciliation).toMatchObject({
      positionId: openPosition.id,
      status: "drift",
    });
  });

  it("marks closing orders as closed when exchange position disappears", () => {
    const processing: SignalProcessingResult = {
      status: "order-submitted",
      side: "long",
      order: {
        purpose: "close",
        status: "filled",
        requestedQuantity: 2,
        executedQuantity: 2,
        externalOrderId: "ext-close",
      },
      reconciliation: {
        status: "ok",
        message: "close_confirmed",
      },
    };

    const position = reconcilePositionRecord(
      bot,
      openPosition,
      processing,
      3000,
    );
    const order = buildOrderRecord(bot, openPosition, processing, 3000);

    expect(position).toMatchObject({
      status: "closed",
      remainingQuantity: 0,
    });
    expect(order).toMatchObject({
      purpose: "close",
      status: "filled",
      requestedQuantity: 2,
    });
  });
});
