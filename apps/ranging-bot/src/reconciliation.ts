import type { ExchangePositionSnapshot } from "@repo/trading-engine";
import type {
  BotRecord,
  PositionRecord,
  ReconciliationEventRecord,
} from "./monitoring/types";

const PRICE_TOLERANCE_BPS = 5;
const QUANTITY_TOLERANCE = 1e-8;

function toSyntheticPositionId(botId: string, side: "long" | "short"): string {
  return `${botId}-recon-${side}`;
}

function quantitiesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) <= QUANTITY_TOLERANCE;
}

function pricesMatch(left?: number, right?: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return left === right;
  if (!left || !right) return left === right;
  const bps = (Math.abs(left - right) / right) * 10_000;
  return bps <= PRICE_TOLERANCE_BPS;
}

function buildEvent(
  bot: BotRecord,
  status: ReconciliationEventRecord["status"],
  message: string,
  nowMs: number,
  positionId?: string,
): ReconciliationEventRecord {
  return {
    id: `${bot.id}-${nowMs}-${status}-${positionId ?? "none"}`,
    botId: bot.id,
    positionId,
    symbol: bot.symbol,
    status,
    message,
    createdAtMs: nowMs,
  };
}

export interface ReconciliationOutcome {
  positions: PositionRecord[];
  events: ReconciliationEventRecord[];
}

function appendOrphanSnapshots(
  bot: BotRecord,
  snapshots: ExchangePositionSnapshot[],
  nowMs: number,
  positions: PositionRecord[],
  events: ReconciliationEventRecord[],
): void {
  for (const snapshot of snapshots) {
    const positionId = toSyntheticPositionId(bot.id, snapshot.side);
    positions.push({
      id: positionId,
      botId: bot.id,
      botName: bot.name,
      strategyId: bot.strategyId,
      strategyVersion: bot.strategyVersion,
      exchangeId: bot.exchangeId,
      accountId: bot.accountId,
      symbol: bot.symbol,
      side: snapshot.side,
      status: "reconciling",
      quantity: snapshot.quantity,
      remainingQuantity: snapshot.quantity,
      avgEntryPrice: snapshot.avgEntryPrice,
      realizedPnl: 0,
      openedAtMs: nowMs,
      lastExchangeSyncTimeMs: nowMs,
      strategyContext: {
        source: "reconciliation",
        orphanExchangePosition: true,
      },
    });
    events.push(
      buildEvent(
        bot,
        "drift",
        `Exchange has open ${snapshot.side} position without local ledger record`,
        nowMs,
        positionId,
      ),
    );
  }
}

export function reconcileBotState(input: {
  bot: BotRecord;
  localPosition: PositionRecord | null;
  exchangeSnapshots: ExchangePositionSnapshot[];
  nowMs: number;
}): ReconciliationOutcome {
  const { bot, localPosition, exchangeSnapshots, nowMs } = input;
  const positions: PositionRecord[] = [];
  const events: ReconciliationEventRecord[] = [];

  if (!localPosition && exchangeSnapshots.length === 0) {
    return { positions, events };
  }

  if (!localPosition) {
    appendOrphanSnapshots(bot, exchangeSnapshots, nowMs, positions, events);

    return { positions, events };
  }

  const matchingSnapshot = exchangeSnapshots.find(
    (snapshot) => snapshot.side === localPosition.side,
  );
  const extraSnapshots = exchangeSnapshots.filter(
    (snapshot) => snapshot.side !== localPosition.side,
  );

  if (!matchingSnapshot) {
    positions.push({
      ...localPosition,
      status: "reconciling",
      lastExchangeSyncTimeMs: nowMs,
    });
    events.push(
      buildEvent(
        bot,
        "drift",
        `Local ${localPosition.side} position is missing on exchange`,
        nowMs,
        localPosition.id,
      ),
    );
    appendOrphanSnapshots(bot, extraSnapshots, nowMs, positions, events);
    return { positions, events };
  }

  const quantityAligned = quantitiesMatch(
    localPosition.remainingQuantity,
    matchingSnapshot.quantity,
  );
  const priceAligned = pricesMatch(
    localPosition.avgEntryPrice,
    matchingSnapshot.avgEntryPrice,
  );

  if (!quantityAligned || !priceAligned) {
    positions.push({
      ...localPosition,
      status: "reconciling",
      lastExchangeSyncTimeMs: nowMs,
    });
    events.push(
      buildEvent(
        bot,
        "drift",
        [
          "Local/exchange position mismatch",
          `qty local=${localPosition.remainingQuantity} exchange=${matchingSnapshot.quantity}`,
          `avg local=${localPosition.avgEntryPrice ?? "-"} exchange=${matchingSnapshot.avgEntryPrice ?? "-"}`,
        ].join(" | "),
        nowMs,
        localPosition.id,
      ),
    );
    appendOrphanSnapshots(bot, extraSnapshots, nowMs, positions, events);
    return { positions, events };
  }

  const restoredStatus =
    localPosition.status === "entry-pending" ||
    localPosition.status === "reconciling"
      ? "open"
      : localPosition.status;
  positions.push({
    ...localPosition,
    status: restoredStatus,
    quantity: matchingSnapshot.quantity,
    remainingQuantity: matchingSnapshot.quantity,
    avgEntryPrice:
      matchingSnapshot.avgEntryPrice ?? localPosition.avgEntryPrice,
    lastExchangeSyncTimeMs: nowMs,
  });

  if (localPosition.status === "reconciling") {
    events.push(
      buildEvent(
        bot,
        "ok",
        "Exchange and local ledger are aligned again",
        nowMs,
        localPosition.id,
      ),
    );
  }
  appendOrphanSnapshots(bot, extraSnapshots, nowMs, positions, events);

  return { positions, events };
}
