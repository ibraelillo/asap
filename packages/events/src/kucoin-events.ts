/// <reference path="../../../sst-env.d.ts" />

import { event } from "sst/event";
import {
  OrderChangeEventSchema,
  PositionChangeEventSchema,
  PositionClosedEventSchema,
} from "./app-events.js";

/**
 * SST Event Builder Configuration
 *
 * Creates type-safe event builders using SST's event system.
 * Each builder validates events with Zod schemas before publishing to EventBridge.
 *
 * Benefits:
 * - Type safety: TypeScript knows the exact shape of each event
 * - Runtime validation: Zod ensures data integrity before publishing
 * - Auto-completion: IDE suggests available event types and fields
 * - Metadata: All events tagged with source: 'kucoin' for filtering
 *
 * @see https://sst.dev/docs/event
 */
const builder = event.builder({
  /**
   * Validator function using Zod schemas
   *
   * This function is called before publishing each event to EventBridge.
   * If validation fails, Zod throws an error with detailed field information.
   *
   * @param schema - Zod schema for the event type
   * @returns Validation function that parses data with the schema
   */
  validator: (schema) => (data) => schema.parse(data),

  /**
   * Metadata attached to all events
   *
   * This metadata is automatically added to every event published
   * through these builders. Useful for:
   * - Filtering events by source in EventBridge rules
   * - Tracking event origins in logs
   * - Debugging event flow
   */
  metadata: () => ({
    source: "kucoin",
  }),
});

/**
 * Position Changed Event Builder
 *
 * Publishes position change events to EventBridge.
 * Triggered when a position is updated (size, PnL, mark price, etc.)
 *
 * Event Type: "position.changed"
 * Schema: PositionChangeEventSchema
 *
 * Usage in orchestrator:
 * ```typescript
 * import { PositionChanged } from '@repo/events';
 *
 * // Parse KuCoin WebSocket message
 * const kucoinEvent = KucoinPositionChangeSchema.parse(rawMessage);
 *
 * // Publish to EventBridge
 * await PositionChanged.publish({
 *   symbol: kucoinEvent.data.symbol,
 *   currentQty: kucoinEvent.data.currentQty,
 *   avgEntryPrice: kucoinEvent.data.avgEntryPrice,
 *   markPrice: kucoinEvent.data.markPrice,
 *   unrealisedPnl: kucoinEvent.data.unrealisedPnl,
 *   realisedPnl: kucoinEvent.data.realisedPnl,
 *   liquidationPrice: kucoinEvent.data.liquidationPrice,
 *   leverage: kucoinEvent.data.realLeverage,
 *   isOpen: kucoinEvent.data.isOpen,
 *   timestamp: kucoinEvent.data.currentTimestamp,
 * });
 * ```
 *
 * Lambda handlers subscribe to this event:
 * ```typescript
 * bus.subscribe("Positions", positionFn.arn, {
 *   pattern: { detailType: ["position.changed"] }
 * });
 * ```
 */
export const PositionChanged = builder(
  "position.changed",
  PositionChangeEventSchema,
);

/**
 * Position Closed Event Builder
 *
 * Publishes position closed events to EventBridge.
 * Triggered when a position is fully closed (currentQty = 0).
 *
 * Event Type: "position.closed"
 * Schema: PositionClosedEventSchema
 *
 * Usage in orchestrator:
 * ```typescript
 * import { PositionClosed } from '@repo/events';
 *
 * // Check if position is closed
 * if (!kucoinEvent.data.isOpen) {
 *   await PositionClosed.publish({
 *     symbol: kucoinEvent.data.symbol,
 *     realisedPnl: kucoinEvent.data.realisedPnl,
 *     closedAt: kucoinEvent.data.currentTimestamp,
 *   });
 * }
 * ```
 *
 * Lambda handlers subscribe to this event:
 * ```typescript
 * bus.subscribe("Positions", positionFn.arn, {
 *   pattern: { detailType: ["position.closed"] }
 * });
 * ```
 */
export const PositionClosed = builder(
  "position.closed",
  PositionChangeEventSchema,
);

/**
 * Order Changed Event Builder
 *
 * Publishes order change events to EventBridge.
 * Triggered when an order status changes (placed, filled, cancelled).
 *
 * Event Type: "order.changed"
 * Schema: OrderChangeEventSchema
 *
 * Usage in orchestrator:
 * ```typescript
 * import { OrderChanged } from '@repo/events';
 *
 * // Parse KuCoin WebSocket message
 * const kucoinEvent = KucoinOrderChangeSchema.parse(rawMessage);
 *
 * // Publish to EventBridge
 * await OrderChanged.publish({
 *   orderId: kucoinEvent.data.orderId,
 *   symbol: kucoinEvent.data.symbol,
 *   side: kucoinEvent.data.side,
 *   orderType: kucoinEvent.data.orderType,
 *   size: kucoinEvent.data.size,
 *   filledSize: kucoinEvent.data.filledSize,
 *   price: kucoinEvent.data.price,
 *   status: kucoinEvent.data.status,
 *   timestamp: kucoinEvent.data.ts,
 * });
 * ```
 *
 * Lambda handlers subscribe to this event:
 * ```typescript
 * bus.subscribe("Orders", orderFn.arn, {
 *   pattern: { detailType: ["order.changed"] }
 * });
 * ```
 */
export const OrderChanged = builder("order.changed", OrderChangeEventSchema);
