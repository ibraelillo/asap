import type { SignalProcessingResult } from "@repo/trading-engine";
import type {
  BotRecord,
  FillRecord,
  OrderRecord,
  PositionRecord,
  ReconciliationEventRecord,
} from "./monitoring/types";

function derivePositionId(
  bot: BotRecord,
  existing: PositionRecord | null,
  processing: SignalProcessingResult,
  generatedAtMs: number,
): string {
  if (existing?.id) return existing.id;
  const side = processing.side ?? processing.positionSnapshot?.side ?? "long";
  return `${bot.id}-${side}-${generatedAtMs}`;
}

export function reconcilePositionRecord(
  bot: BotRecord,
  existing: PositionRecord | null,
  processing: SignalProcessingResult,
  generatedAtMs: number,
): PositionRecord | undefined {
  const positionId = derivePositionId(bot, existing, processing, generatedAtMs);
  const liveSnapshot = processing.positionSnapshot;
  const order = processing.order;
  const reconciliation = processing.reconciliation;

  if (liveSnapshot?.isOpen) {
    return {
      id: positionId,
      botId: bot.id,
      botName: bot.name,
      strategyId: bot.strategyId,
      strategyVersion: bot.strategyVersion,
      exchangeId: bot.exchangeId,
      accountId: bot.accountId,
      symbol: bot.symbol,
      side: liveSnapshot.side,
      status:
        order?.purpose === "reduce"
          ? "reducing"
          : order?.purpose === "close"
            ? "closing"
            : "open",
      quantity: liveSnapshot.quantity,
      remainingQuantity: liveSnapshot.quantity,
      avgEntryPrice: liveSnapshot.avgEntryPrice ?? existing?.avgEntryPrice,
      stopPrice: existing?.stopPrice,
      realizedPnl: existing?.realizedPnl ?? 0,
      unrealizedPnl: existing?.unrealizedPnl,
      openedAtMs: existing?.openedAtMs ?? generatedAtMs,
      closedAtMs: undefined,
      lastStrategyDecisionTimeMs: generatedAtMs,
      lastExchangeSyncTimeMs: generatedAtMs,
      strategyContext: existing?.strategyContext,
    };
  }

  if (order?.purpose === "entry") {
    return {
      id: positionId,
      botId: bot.id,
      botName: bot.name,
      strategyId: bot.strategyId,
      strategyVersion: bot.strategyVersion,
      exchangeId: bot.exchangeId,
      accountId: bot.accountId,
      symbol: bot.symbol,
      side: processing.side ?? existing?.side ?? "long",
      status:
        order.status === "rejected"
          ? "error"
          : order.status === "filled"
            ? "open"
            : "entry-pending",
      quantity:
        order.executedQuantity ??
        order.requestedQuantity ??
        existing?.quantity ??
        0,
      remainingQuantity:
        order.executedQuantity ??
        order.requestedQuantity ??
        existing?.remainingQuantity ??
        0,
      avgEntryPrice: order.executedPrice ?? existing?.avgEntryPrice,
      stopPrice: existing?.stopPrice,
      realizedPnl: existing?.realizedPnl ?? 0,
      unrealizedPnl: existing?.unrealizedPnl,
      openedAtMs: existing?.openedAtMs ?? generatedAtMs,
      closedAtMs: undefined,
      lastStrategyDecisionTimeMs: generatedAtMs,
      lastExchangeSyncTimeMs:
        order.status === "filled"
          ? generatedAtMs
          : existing?.lastExchangeSyncTimeMs,
      strategyContext: existing?.strategyContext,
    };
  }

  if (order?.purpose === "close" && existing) {
    return {
      ...existing,
      status:
        order.status === "rejected"
          ? "error"
          : order.status === "filled"
            ? "closed"
            : "closing",
      remainingQuantity:
        order.status === "filled" ? 0 : existing.remainingQuantity,
      closedAtMs:
        order.status === "filled" ? generatedAtMs : existing.closedAtMs,
      lastStrategyDecisionTimeMs: generatedAtMs,
      lastExchangeSyncTimeMs: generatedAtMs,
    };
  }

  if (reconciliation?.status === "drift" && existing) {
    return {
      ...existing,
      status: "reconciling",
      lastStrategyDecisionTimeMs: generatedAtMs,
      lastExchangeSyncTimeMs: generatedAtMs,
    };
  }

  if (reconciliation?.status === "error" && existing) {
    return {
      ...existing,
      status: "error",
      lastStrategyDecisionTimeMs: generatedAtMs,
      lastExchangeSyncTimeMs: generatedAtMs,
    };
  }

  if (processing.status === "synced-position" && existing && !liveSnapshot) {
    return {
      ...existing,
      status: "reconciling",
      lastExchangeSyncTimeMs: generatedAtMs,
    };
  }

  return existing ?? undefined;
}

export function buildOrderRecord(
  bot: BotRecord,
  position: PositionRecord | null,
  processing: SignalProcessingResult,
  generatedAtMs: number,
): OrderRecord | undefined {
  if (!processing.order) return undefined;

  const positionId = derivePositionId(bot, position, processing, generatedAtMs);
  const orderId =
    processing.order.clientOid ??
    processing.order.externalOrderId ??
    `${positionId}-${processing.order.purpose}-${generatedAtMs}`;

  return {
    id: orderId,
    botId: bot.id,
    positionId,
    symbol: bot.symbol,
    side:
      processing.side ??
      processing.positionSnapshot?.side ??
      position?.side ??
      "long",
    purpose: processing.order.purpose,
    status: processing.order.status,
    requestedPrice: processing.order.requestedPrice,
    executedPrice: processing.order.executedPrice,
    requestedQuantity: processing.order.requestedQuantity,
    requestedValueQty: processing.order.requestedValueQty,
    executedQuantity: processing.order.executedQuantity,
    externalOrderId: processing.order.externalOrderId,
    clientOid: processing.order.clientOid,
    createdAtMs: generatedAtMs,
    updatedAtMs: generatedAtMs,
  };
}

export function buildFillRecords(
  bot: BotRecord,
  position: PositionRecord | null,
  processing: SignalProcessingResult,
  generatedAtMs: number,
): FillRecord[] {
  const order = buildOrderRecord(bot, position, processing, generatedAtMs);
  const snapshot = processing.positionSnapshot;

  if (!order || order.status !== "filled") return [];

  if (order.purpose === "entry" && snapshot?.isOpen) {
    return [
      {
        id: `${order.id}-fill`,
        botId: bot.id,
        positionId: order.positionId,
        orderId: order.id,
        symbol: bot.symbol,
        side: snapshot.side,
        reason: "entry",
        source: "exchange-snapshot",
        price: snapshot.avgEntryPrice,
        quantity: snapshot.quantity,
        createdAtMs: generatedAtMs,
      },
    ];
  }

  return [];
}

export function buildReconciliationEventRecord(
  bot: BotRecord,
  position: PositionRecord | null,
  processing: SignalProcessingResult,
  generatedAtMs: number,
): ReconciliationEventRecord | undefined {
  if (!processing.reconciliation) return undefined;

  return {
    id: `${bot.id}-${generatedAtMs}-${processing.reconciliation.status}`,
    botId: bot.id,
    positionId: position?.id,
    symbol: bot.symbol,
    status: processing.reconciliation.status,
    message: processing.reconciliation.message,
    createdAtMs: generatedAtMs,
  };
}
