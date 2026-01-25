/**
 * @repo/events
 *
 * Event mapping package for KuCoin WebSocket events to application events.
 *
 * This package provides:
 * 1. Zod schemas for validating KuCoin WebSocket messages
 * 2. Simplified application event schemas
 * 3. SST event builders for type-safe EventBridge publishing
 * 4. Event type constants for consistency
 *
 * Architecture:
 *
 *   KuCoin WebSocket → Orchestrator → EventBridge → Lambda Functions
 *        (30+ fields)      (validate)    (8-10 fields)    (process)
 *
 * Flow:
 * 1. Orchestrator receives raw WebSocket message from KuCoin
 * 2. Validate with KucoinPositionChangeSchema or KucoinOrderChangeSchema
 * 3. Publish to EventBridge using PositionChanged or OrderChanged builders
 * 4. Lambda functions receive simplified events and execute trading logic
 *
 * Benefits:
 * - Type safety: Zod + TypeScript catch errors at compile time
 * - Validation: Runtime checks ensure data integrity
 * - Decoupling: Application logic independent of KuCoin API changes
 * - Simplification: Only essential fields passed to Lambda functions
 * - Maintainability: Single source of truth for event schemas
 *
 * @example Orchestrator usage
 * ```typescript
 * import {
 *   KucoinPositionChangeSchema,
 *   PositionChanged
 * } from '@repo/events';
 *
 * // Validate incoming WebSocket message
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
 * @example Lambda handler usage
 * ```typescript
 * import { PositionChangeEvent } from '@repo/events';
 *
 * export const handler = async (event: { detail: PositionChangeEvent }) => {
 *   const { symbol, currentQty, avgEntryPrice } = event.detail;
 *
 *   // Execute trading logic
 *   if (currentQty > 0) {
 *     await placeTakeProfitOrder(symbol, avgEntryPrice);
 *   }
 * };
 * ```
 */

// ============================================================================
// KuCoin WebSocket Event Schemas
// ============================================================================
// These schemas validate raw WebSocket messages from KuCoin.
// Use these in the orchestrator to ensure data integrity before processing.

export {
  /**
   * Zod schema for KuCoin position change WebSocket messages
   * Validates 30+ fields from KuCoin's position.change event
   */
  KucoinPositionChangeSchema,

  /**
   * Zod schema for KuCoin order change WebSocket messages
   * Validates order status updates from KuCoin's orderChange event
   */
  KucoinOrderChangeSchema,

  /**
   * TypeScript type for validated KuCoin position change events
   */
  type KucoinPositionChange,

  /**
   * TypeScript type for validated KuCoin order change events
   */
  type KucoinOrderChange,
} from "./kucoin-schemas.js";

// ============================================================================
// Application Event Schemas
// ============================================================================
// These schemas define simplified events for internal application use.
// Use these types in Lambda handlers for type-safe event processing.

export {
  /**
   * Zod schema for position change application events
   * Simplified to 10 essential fields for trading logic
   */
  PositionChangeEventSchema,

  /**
   * Zod schema for position closed application events
   * Minimal event with just symbol, PnL, and timestamp
   */
  PositionClosedEventSchema,

  /**
   * Zod schema for order change application events
   * Simplified order status updates
   */
  OrderChangeEventSchema,

  /**
   * TypeScript type for position change events
   * Use in Lambda handlers: (event: { detail: PositionChangeEvent })
   */
  type PositionChangeEvent,

  /**
   * TypeScript type for position closed events
   * Use in Lambda handlers: (event: { detail: PositionClosedEvent })
   */
  type PositionClosedEvent,

  /**
   * TypeScript type for order change events
   * Use in Lambda handlers: (event: { detail: OrderChangeEvent })
   */
  type OrderChangeEvent,
} from "./app-events.js";

// ============================================================================
// SST Event Builders
// ============================================================================
// Type-safe event builders for publishing to EventBridge.
// Use these in the orchestrator to publish validated events.

export {
  /**
   * SST event builder for position change events
   * Validates with PositionChangeEventSchema before publishing
   *
   * Usage: await PositionChanged.publish({ symbol, currentQty, ... })
   */
  PositionChanged,

  /**
   * SST event builder for position closed events
   * Validates with PositionClosedEventSchema before publishing
   *
   * Usage: await PositionClosed.publish({ symbol, realisedPnl, closedAt })
   */
  PositionClosed,

  /**
   * SST event builder for order change events
   * Validates with OrderChangeEventSchema before publishing
   *
   * Usage: await OrderChanged.publish({ orderId, symbol, status, ... })
   */
  OrderChanged,
} from "./kucoin-events.js";

// ============================================================================
// Event Type Constants
// ============================================================================
// Centralized event type definitions for consistency across the system.
// Use these in EventBridge subscriptions and event handlers.

export {
  /**
   * Event type constants object
   * Contains: POSITION_CHANGE, POSITION_CLOSED, ORDER_CHANGE, ORCHESTRATOR_STARTED
   *
   * Usage: EventTypes.POSITION_CHANGE
   */
  EventTypes,

  /**
   * TypeScript union type of all event types
   * "position.change" | "position.closed" | "orderChange" | "orchestrator.started"
   */
  type EventType,
} from "./event-types.js";

// ============================================================================
// Core System Events
// ============================================================================
// System-level events for orchestrator and bot lifecycle management.
// Use these for coordinating service startup and bot state changes.

export {
  /**
   * Zod schema for orchestrator started events
   * Contains timestamp when orchestrator service started
   */
  OrquestratorStartedSchema,

  /**
   * SST event builder for orchestrator started events
   * Publishes when orchestrator establishes WebSocket connections
   *
   * Usage: await OrquestratorStarted.publish({ ts: Date.now() })
   */
  OrquestratorStarted,

  /**
   * Zod schema for bot started/stopped events
   * Can identify bot by ID or symbol + positionSide
   */
  BotStartedSchema,

  /**
   * SST event builder for bot started events
   * Publishes when a trading bot is enabled
   *
   * Usage: await BotStarted.publish({ symbol: "XBTUSDTM", positionSide: "LONG" })
   */
  BotStarted,

  /**
   * SST event builder for bot stopped events
   * Publishes when a trading bot is disabled
   *
   * Usage: await BotStopped.publish({ symbol: "XBTUSDTM", positionSide: "LONG" })
   */
  BotStopped,
} from "./core-events.js";
