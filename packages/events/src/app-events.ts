import { z } from "zod";

/**
 * Application Event Schema: Position Change
 *
 * Simplified position event for internal application use.
 * This schema strips away KuCoin-specific fields and keeps only
 * the essential data needed for trading bot logic.
 *
 * Published to EventBridge with detail-type: "position.change"
 *
 * Use cases:
 * - Trigger take-profit order placement when position opens
 * - Update position tracking in DynamoDB
 * - Calculate risk metrics for monitoring
 * - Send notifications on significant PnL changes
 *
 * Example event:
 * {
 *   "symbol": "XBTUSDTM",
 *   "currentQty": 100,
 *   "avgEntryPrice": 50000,
 *   "markPrice": 51000,
 *   "unrealisedPnl": 100,
 *   "isOpen": true,
 *   ...
 * }
 */
export const PositionChangeEventSchema = z.object({
  // Trading pair symbol (e.g., "XBTUSDTM")
  symbol: z.string(),

  // Current position size in contracts
  // Positive = long position, Negative = short position, 0 = no position
  currentQty: z.number(),

  // Average entry price of the position
  // Used to calculate profit/loss and determine take-profit levels
  avgEntryPrice: z.number(),

  // Current mark price (fair price used for PnL calculation)
  // Different from last traded price to prevent manipulation
  markPrice: z.number(),

  // Unrealized profit/loss in settlement currency (USDT)
  // Calculated as: (markPrice - avgEntryPrice) * currentQty
  unrealisedPnl: z.number(),

  // Realized profit/loss from closed portions of the position
  // Only updates when position is partially or fully closed
  realisedPnl: z.number(),

  // Price at which position will be force-liquidated
  // Critical for risk management and stop-loss placement
  liquidationPrice: z.number(),

  // Actual leverage being used (position value / margin)
  // May differ from selected leverage due to position size
  leverage: z.number(),

  // Whether position is currently open
  // false = position fully closed, true = position active
  isOpen: z.boolean(),

  // Unix timestamp of this update in milliseconds
  // Used for event ordering and time-based logic
  timestamp: z.number().optional(),

  // Maintenance margin requirement percentage (e.g., 0.005 = 0.5%)
  maintMarginReq: z.number(),

  // Maximum position size allowed in contracts
  riskLimit: z.number().optional(),

  // Cross margin mode (true) or isolated margin (false)
  crossMode: z.boolean(),

  // Auto-deleveraging percentage (0-1, higher = more likely to be deleveraged)
  delevPercentage: z.number(),

  // Unix timestamp when position was opened (milliseconds)
  openingTimestamp: z.number(),

  // Auto-deposit from available balance to maintain position
  autoDeposit: z.boolean().optional(),

  // Current cost basis of the position
  currentCost: z.number(),

  // Current commission accumulated
  currentComm: z.number(),

  // Cost basis for unrealized PnL calculation
  unrealisedCost: z.number(),

  // Realized cost (fees paid on closed portion)
  realisedCost: z.number(),

  // Current position value at mark price
  markValue: z.number(),

  // Total cost of opening the position
  posCost: z.number().optional(),

  // Cross margin allocated to this position
  posCross: z.number().optional(),

  // Initial margin used to open position
  posInit: z.number(),

  // Commission/fees paid on this position
  posComm: z.number().optional(),

  // Potential loss if position is liquidated
  posLoss: z.number().optional(),

  // Total margin allocated to this position
  posMargin: z.number().or(z.null()).optional(),

  // Funding fees paid (negative) or received (positive)
  posFunding: z.number().optional(),

  // Maintenance margin required to keep position open
  posMaint: z.number().optional(),

  // Current maintenance margin
  maintMargin: z.number().optional(),

  // Price at which position equity reaches zero
  bankruptPrice: z.number(),

  // Settlement currency (e.g., "USDT", "BTC")
  settleCurrency: z.string(),

  // Reason for position change ("positionChange", "markPriceChange", "trade", "liquidation")
  changeReason: z.string(),

  // Current risk limit level (1, 2, 3, etc.)
  riskLimitLevel: z.number().optional(),

  // Realized gross cost (before fees)
  realisedGrossCost: z.number(),

  // Realized gross profit/loss (before fees)
  realisedGrossPnl: z.number(),

  // Unrealized PnL as percentage (0.0016 = 0.16%)
  unrealisedPnlPcnt: z.number(),

  // Unrealized return on equity as percentage (0.0079 = 0.79%)
  unrealisedRoePcnt: z.number(),

  // Margin mode: "ISOLATED" or "CROSS"
  marginMode: z.string(),

  // Position side: "BOTH" (one-way mode), "LONG", or "SHORT" (hedge mode)
  positionSide: z.literal("LONG").or(z.literal("SHORT")).or(z.literal("BOTH")),
});

/**
 * Application Event Schema: Position Closed
 *
 * Triggered when a position is fully closed (currentQty = 0).
 * This is a critical event that signals the bot to:
 * - Open a new position (if bot is still enabled)
 * - Cancel any remaining take-profit or stop-loss orders
 * - Record final PnL for analytics
 * - Update bot state in DynamoDB
 *
 * Published to EventBridge with detail-type: "position.closed"
 *
 * Example event:
 * {
 *   "symbol": "XBTUSDTM",
 *   "realisedPnl": 150.50,
 *   "closedAt": 1704067200000
 * }
 */
export const PositionClosedEventSchema = z.object({
  // Trading pair symbol (e.g., "XBTUSDTM")
  symbol: z.string(),

  // Final realized profit/loss in settlement currency (USDT)
  // Positive = profit, Negative = loss
  // Used for performance tracking and analytics
  realisedPnl: z.number(),

  // Unix timestamp when position was closed (milliseconds)
  // Used for trade history and performance analysis
  closedAt: z.number().optional(),
});

/**
 * Application Event Schema: Order Change
 *
 * Simplified order event for tracking order execution.
 * Triggered whenever an order status changes:
 * - Order placed (status: "open")
 * - Order partially filled (status: "match")
 * - Order fully filled (status: "done")
 * - Order cancelled (status: "done")
 *
 * Published to EventBridge with detail-type: "orderChange"
 *
 * Use cases:
 * - Track order execution for analytics
 * - Detect failed orders and retry
 * - Update order status in DynamoDB
 * - Send notifications on order fills
 *
 * Example event:
 * {
 *   "orderId": "5cdfc138b21023a909e5ad55",
 *   "symbol": "XBTUSDTM",
 *   "side": "buy",
 *   "status": "done",
 *   "filledSize": 100,
 *   ...
 * }
 */
export const OrderChangeEventSchema = z.object({
  // Unique order ID from KuCoin
  // Used to track and correlate order events
  orderId: z.string(),

  // Trading pair symbol (e.g., "XBTUSDTM")
  symbol: z.string(),

  // Order side: "buy" or "sell"
  side: z.string(),

  // Order side: "buy" or "sell"
  positionSide: z.string(),

  // Order type: "limit", "market", "stop", "take_profit"
  type: z.string(),

  price: z.string(),

  // Total order size in contracts
  size: z.coerce.number(),

  // Amount filled so far in contracts
  // Compare with size to determine if order is fully filled
  filledSize: z.coerce.number(),

  // Order price (string to preserve decimal precision)
  // For market orders, this is the average fill price
  price: z.string(),

  // Order status: "open", "match", "done"
  // - "open": Order placed, waiting for fill
  // - "match": Order partially or fully filled
  // - "done": Order completed (filled or cancelled)
  status: z.string(),

  // Unix timestamp of this update in milliseconds
  // Converted from KuCoin's nanosecond timestamp
  timestamp: z.number().optional(),
});

/**
 * TypeScript type for position change events
 * Use this type in Lambda handlers that process position updates
 */
export type PositionChangeEvent = z.infer<typeof PositionChangeEventSchema>;

/**
 * TypeScript type for position closed events
 * Use this type in Lambda handlers that process position closures
 */
export type PositionClosedEvent = z.infer<typeof PositionClosedEventSchema>;

/**
 * TypeScript type for order change events
 * Use this type in Lambda handlers that process order updates
 */
export type OrderChangeEvent = z.infer<typeof OrderChangeEventSchema>;
