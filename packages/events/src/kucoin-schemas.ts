import { z } from "zod";

/**
 * KuCoin WebSocket Position Change Event Schema
 *
 * This schema validates incoming WebSocket messages from KuCoin's private channel
 * for position updates. KuCoin sends these events whenever a position changes due to:
 * - New position opened
 * - Position size increased/decreased
 * - Mark price changed (affects unrealized PnL)
 * - Position closed
 *
 * WebSocket Topic: /contractMarket/tradeOrders
 * Subject: position.change
 *
 * Example raw message:
 * {
 *   "type": "message",
 *   "topic": "/contractMarket/tradeOrders",
 *   "subject": "position.change",
 *   "data": { ... }
 * }
 *
 * @see https://docs.kucoin.com/futures/#position-change-events
 */
export const KucoinPositionChangeSchema = z.object({
  // Message type - always "message" for data events
  type: z.literal("message"),

  // WebSocket topic subscribed to
  topic: z.string(),

  // Event subject - identifies the type of position event
  subject: z.literal("position.change"),

  // Position data payload
  data: z.object({
    // Realized gross profit and loss (before fees)
    realisedGrossPnl: z.number(),

    // Trading pair symbol (e.g., "XBTUSDTM" for Bitcoin perpetual)
    symbol: z.string(),

    // Cross margin mode enabled (true) or isolated margin (false)
    crossMode: z.boolean(),

    // Price at which position will be liquidated
    liquidationPrice: z.number(),

    // Potential loss if position is liquidated
    posLoss: z.number(),

    // Average entry price of the position
    avgEntryPrice: z.number(),

    // Unrealized profit/loss at current mark price
    unrealisedPnl: z.number(),

    // Current mark price used for PnL calculation
    markPrice: z.number(),

    // Margin allocated to this position
    posMargin: z.number(),

    // Auto-deposit from available balance enabled
    autoDeposit: z.boolean(),

    // Maximum position size allowed (risk limit)
    riskLimit: z.number(),

    // Cost basis for unrealized PnL calculation
    unrealisedCost: z.number(),

    // Commission/fees paid on this position
    posComm: z.number(),

    // Maintenance margin required to keep position open
    posMaint: z.number(),

    // Total cost of opening the position
    posCost: z.number(),

    // Maintenance margin requirement percentage
    maintMarginReq: z.number(),

    // Price at which position equity reaches zero
    bankruptPrice: z.number(),

    // Realized cost (fees paid on closed portion)
    realisedCost: z.number(),

    // Current position value at mark price
    markValue: z.number(),

    // Initial margin used to open position
    posInit: z.number(),

    // Realized profit/loss (closed portion)
    realisedPnl: z.number(),

    // Current maintenance margin
    maintMargin: z.number(),

    // Actual leverage being used (position value / margin)
    realLeverage: z.number(),

    // Reason for position change (e.g., "markPriceChange", "trade")
    changeReason: z.string(),

    // Current cost basis of the position
    currentCost: z.number(),

    // Unix timestamp when position was opened (milliseconds)
    openingTimestamp: z.number(),

    // Current position size (positive = long, negative = short)
    currentQty: z.number(),

    // Deleveraging percentage (ADL indicator)
    delevPercentage: z.number(),

    // Current commission accumulated
    currentComm: z.number(),

    // Realized gross cost
    realisedGrossCost: z.number(),

    // Whether position is currently open
    isOpen: z.boolean(),

    // Cross margin allocated
    posCross: z.number(),

    // Unix timestamp of this update (milliseconds)
    currentTimestamp: z.number(),

    // Unrealized ROE percentage
    unrealisedRoePcnt: z.number(),

    // Unrealized PnL percentage
    unrealisedPnlPcnt: z.number(),

    // Settlement currency (e.g., "USDT")
    settleCurrency: z.string(),
  }),
});

/**
 * KuCoin WebSocket Order Change Event Schema
 *
 * This schema validates incoming WebSocket messages from KuCoin's private channel
 * for order updates. KuCoin sends these events whenever an order status changes:
 * - Order placed (status: "open")
 * - Order partially filled (status: "open", filledSize > 0)
 * - Order fully filled (status: "done")
 * - Order cancelled (status: "done")
 *
 * WebSocket Topic: /contractMarket/tradeOrders
 * Subject: orderChange
 *
 * Example raw message:
 * {
 *   "type": "message",
 *   "topic": "/contractMarket/tradeOrders",
 *   "subject": "orderChange",
 *   "data": {
 *     "orderId": "5cdfc138b21023a909e5ad55",
 *     "symbol": "XBTUSDTM",
 *     "side": "buy",
 *     "status": "open",
 *     ...
 *   }
 * }
 *
 * @see https://docs.kucoin.com/futures/#order-change-events
 */
export const KucoinOrderChangeSchema = z.object({
  // Message type - always "message" for data events
  type: z.literal("message"),

  // WebSocket topic subscribed to
  topic: z.string(),

  // Event subject - identifies the type of order event
  subject: z.literal("orderChange"),

  // Order data payload
  data: z.object({
    // Trading pair symbol (e.g., "XBTUSDTM")
    symbol: z.string(),

    // Order type: "limit", "market", "stop", "take_profit"
    orderType: z.string(),

    // Order side: "buy" or "sell"
    side: z.string(),

    // Unique order ID from KuCoin
    orderId: z.string(),

    // Order execution type: "match" (filled), "open", "canceled"
    type: z.string(),

    // Unix timestamp when order was placed (nanoseconds)
    orderTime: z.number(),

    // Total order size (contracts)
    size: z.number(),

    // Amount filled so far (contracts)
    filledSize: z.number(),

    // Order price (string to preserve precision)
    price: z.string(),

    // Client-provided order ID (optional, for order tracking)
    clientOid: z.string().optional(),

    // Remaining unfilled size (contracts)
    remainSize: z.number(),

    // Order status: "open", "done", "match"
    // - "open": Order placed but not filled
    // - "match": Order partially or fully filled
    // - "done": Order completed (filled or cancelled)
    status: z.string(),

    // Unix timestamp of this update (nanoseconds)
    ts: z.number(),
  }),
});

/**
 * TypeScript type inferred from KucoinPositionChangeSchema
 * Use this type for type-safe handling of validated position events
 */
export type KucoinPositionChange = z.infer<typeof KucoinPositionChangeSchema>;

/**
 * TypeScript type inferred from KucoinOrderChangeSchema
 * Use this type for type-safe handling of validated order events
 */
export type KucoinOrderChange = z.infer<typeof KucoinOrderChangeSchema>;
