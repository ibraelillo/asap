import type { PositionState, PositionStatus } from "./types";

export type PositionLifecycleEvent =
  | { type: "strategy.enter"; quantity: number; stopPrice?: number; avgEntryPrice?: number; at: number }
  | { type: "strategy.reduce"; remainingQuantity: number; at: number }
  | { type: "strategy.move-stop"; stopPrice: number; at: number }
  | { type: "strategy.close"; at: number }
  | { type: "exchange.order-rejected"; at: number }
  | { type: "exchange.position-sync"; status: Extract<PositionStatus, "open" | "closed" | "reconciling">; at: number }
  | { type: "reconcile.detected-drift"; at: number };

export function transitionPositionState(
  current: PositionState | null,
  event: PositionLifecycleEvent,
): PositionState | null {
  if (!current) {
    if (event.type !== "strategy.enter") return current;
    return {
      botId: "unknown",
      positionId: "pending",
      symbol: "unknown",
      side: "long",
      status: "entry-pending",
      quantity: event.quantity,
      remainingQuantity: event.quantity,
      avgEntryPrice: event.avgEntryPrice,
      stopPrice: event.stopPrice,
      realizedPnl: 0,
      openedAtMs: event.at,
    };
  }

  switch (event.type) {
    case "strategy.enter":
      return {
        ...current,
        status: "entry-pending",
        quantity: event.quantity,
        remainingQuantity: event.quantity,
        avgEntryPrice: event.avgEntryPrice ?? current.avgEntryPrice,
        stopPrice: event.stopPrice ?? current.stopPrice,
        openedAtMs: current.openedAtMs ?? event.at,
      };
    case "strategy.reduce":
      return {
        ...current,
        status: event.remainingQuantity > 0 ? "reducing" : "closed",
        remainingQuantity: Math.max(0, event.remainingQuantity),
        closedAtMs: event.remainingQuantity > 0 ? current.closedAtMs : event.at,
      };
    case "strategy.move-stop":
      return {
        ...current,
        stopPrice: event.stopPrice,
      };
    case "strategy.close":
      return {
        ...current,
        status: "closed",
        remainingQuantity: 0,
        closedAtMs: event.at,
      };
    case "exchange.order-rejected":
      return {
        ...current,
        status: "error",
      };
    case "exchange.position-sync":
      return {
        ...current,
        status: event.status,
        closedAtMs: event.status === "closed" ? event.at : current.closedAtMs,
      };
    case "reconcile.detected-drift":
      return {
        ...current,
        status: "reconciling",
      };
    default:
      return current;
  }
}
