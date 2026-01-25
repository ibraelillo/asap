/**
 * Event Type Constants
 *
 * Centralized definition of all event types used in the trading system.
 * These constants ensure consistency across:
 * - Event publishers (orchestrator)
 * - Event subscribers (Lambda functions)
 * - EventBridge rules and patterns
 *
 * Using constants prevents typos and makes refactoring easier.
 * If an event type changes, update it here and TypeScript will
 * catch all usages that need updating.
 *
 * Event Flow:
 * 1. Orchestrator receives WebSocket message from KuCoin
 * 2. Orchestrator publishes event to EventBridge with one of these types
 * 3. EventBridge routes event to subscribed Lambda functions
 * 4. Lambda functions process event based on type
 *
 * @example
 * // Publishing an event
 * await bus.publish({
 *   "detail-type": EventTypes.POSITION_CHANGE,
 *   detail: positionData
 * });
 *
 * @example
 * // Subscribing to events
 * bus.subscribe("Positions", positionFn.arn, {
 *   pattern: {
 *     detailType: [EventTypes.POSITION_CHANGE, EventTypes.POSITION_CLOSED]
 *   }
 * });
 */
export const EventTypes = {
  /**
   * Position Change Event
   *
   * Triggered when a position is updated:
   * - Position opened
   * - Position size increased/decreased
   * - Mark price changed (affects unrealized PnL)
   * - Margin adjusted
   *
   * Subscribers: Position Lambda function
   */
  POSITION_CHANGE: "position.change",

  /**
   * Position Closed Event
   *
   * Triggered when a position is fully closed (currentQty = 0).
   * This is a critical event that signals the bot to open a new position.
   *
   * Subscribers: Position Lambda function
   */
  POSITION_CLOSED: "position.closed",

  /**
   * Order Change Event
   *
   * Triggered when an order status changes:
   * - Order placed (status: "open")
   * - Order partially filled (status: "match")
   * - Order fully filled (status: "done")
   * - Order cancelled (status: "done")
   *
   * Subscribers: Order Lambda function
   */
  ORDER_CHANGE: "orderChange",

  /**
   * Orchestrator Started Event
   *
   * Triggered when the orchestrator service starts up.
   * Used to notify Lambda functions that WebSocket connections are ready.
   * Lambda functions can use this to initialize state or sync data.
   *
   * Subscribers: Position Lambda, Order Lambda
   */
  ORCHESTRATOR_STARTED: "orchestrator.started",
} as const;

/**
 * TypeScript type for event types
 *
 * This creates a union type of all possible event type values:
 * "position.change" | "position.closed" | "orderChange" | "orchestrator.started"
 *
 * Use this type for type-safe event handling:
 * ```typescript
 * function handleEvent(eventType: EventType) {
 *   switch (eventType) {
 *     case EventTypes.POSITION_CHANGE:
 *       // TypeScript knows this is a position change
 *       break;
 *     case EventTypes.POSITION_CLOSED:
 *       // TypeScript knows this is a position closed
 *       break;
 *   }
 * }
 * ```
 */
export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
