// ---------- Types ----------
import { PositionSide } from "./schemas/order.js";

export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "market";
export type TimeInForce = "GTC" | "IOC" | "FOK";

export interface MarketOrderParams {
  clientOid?: string;
  side: OrderSide;
  symbol: string;
  type: "market";
  size?: number;
  qty?: string;
}

export interface LimitOrderParams {
  clientOid?: string;
  side: OrderSide;
  symbol: string;
  type: "limit";
  price: string;
  size: number;
  timeInForce?: TimeInForce;
}

export type AddOrderParams = MarketOrderParams | LimitOrderParams;

export interface AddOrderResponse {
  orderId: string;
  clientOid: string;
}

// Positions
export interface Position {
  // Trading pair symbol (e.g., "XBTUSDTM")
  symbol: string;

  // Current position size in contracts
  // Positive = long position, Negative = short position, 0 = no position
  currentQty: number;

  // Average entry price of the position
  // Used to calculate profit/loss and determine take-profit levels
  avgEntryPrice: number;

  // Current mark price (fair price used for PnL calculation)
  // Different from last traded price to prevent manipulation
  markPrice: number;

  // Unrealized profit/loss in settlement currency (USDT)
  // Calculated as: (markPrice - avgEntryPrice) * currentQty
  unrealisedPnl: number;

  // Realized profit/loss from closed portions of the position
  // Only updates when position is partially or fully closed
  realisedPnl: number;

  // Price at which position will be force-liquidated
  // Critical for risk management and stop-loss placement
  liquidationPrice: number;

  // Actual leverage being used (position value / margin)
  // May differ from selected leverage due to position size
  leverage: number;

  // Whether position is currently open
  // false = position fully closed, true = position active
  isOpen: boolean;

  // Unix timestamp of this update in milliseconds
  // Used for event ordering and time-based logic
  timestamp?: number;

  // Maintenance margin requirement percentage (e.g., 0.005 = 0.5%)
  maintMarginReq: number;

  // Maximum position size allowed in contracts
  riskLimit?: number;

  // Cross margin mode (true) or isolated margin (false)
  crossMode: boolean;

  // Auto-deleveraging percentage (0-1, higher = more likely to be deleveraged)
  delevPercentage: number;

  // Unix timestamp when position was opened (milliseconds)
  openingTimestamp: number;

  // Auto-deposit from available balance to maintain position
  autoDeposit?: boolean;

  // Current cost basis of the position
  currentCost: number;

  // Current commission accumulated
  currentComm: number;

  // Cost basis for unrealized PnL calculation
  unrealisedCost: number;

  // Realized cost (fees paid on closed portion)
  realisedCost: number;

  // Current position value at mark price
  markValue: number;

  // Total cost of opening the position
  posCost?: number;

  // Cross margin allocated to this position
  posCross?: number;

  // Initial margin used to open position
  posInit: number;

  // Commission/fees paid on this position
  posComm?: number;

  // Potential loss if position is liquidated
  posLoss?: number;

  // Total margin allocated to this position
  posMargin?: number | null;

  // Funding fees paid (negative) or received (positive)
  posFunding?: number;

  // Maintenance margin required to keep position open
  posMaint?: number;

  // Current maintenance margin
  maintMargin?: number;

  // Price at which position equity reaches zero
  bankruptPrice: number;

  // Settlement currency (e.g., "USDT", "BTC")
  settleCurrency: string;

  // Reason for position change ("positionChange", "markPriceChange", "trade", "liquidation")
  changeReason: string;

  // Current risk limit level (1, 2, 3, etc.)
  riskLimitLevel?: number;

  // Realized gross cost (before fees)
  realisedGrossCost: number;

  // Realized gross profit/loss (before fees)
  realisedGrossPnl: number;

  // Unrealized PnL as percentage (0.0016 = 0.16%)
  unrealisedPnlPcnt: number;

  // Unrealized return on equity as percentage (0.0079 = 0.79%)
  unrealisedRoePcnt: number;

  // Margin mode: "ISOLATED" or "CROSS"
  marginMode: "CROSS" | "ISOLATED";

  // Position side: "BOTH" (one-way mode), "LONG", or "SHORT" (hedge mode)
  positionSide: "LONG" | "SHORT" | "BOTH";
}

// Accounts
export interface AccountBalance {
  accountEquity: number;
  unrealisedPNL: number;
  marginBalance: number;
  positionMargin: number;
  orderMargin: number;
  frozenFunds: number;
  availableBalance: number;
  currency: string;
  [key: string]: any;
}

export interface ApiResult<T> {
  code: string;
  data: T;
  msg?: string;
}

// ---------- Abstractions ----------
export type HttpClient = (
  method: "GET" | "POST" | "DELETE",
  url: string,
  body?: string,
  headers?: Record<string, string>,
) => Promise<any>;

export type Logger = {
  info: (msg: string, meta?: any) => void;
  warn: (msg: string, meta?: any) => void;
  error: (msg: string, meta?: any) => void;
};

export type TimeProvider = () => number;
export type UuidProvider = () => string;

export type Order = {
  id: string;
  symbol: string;
  type: "limit" | "market" | string;
  side: "buy" | "sell" | string;
  price: string;
  size: number;
  value: string;
  dealValue: string;
  dealSize: number;
  stp: string;
  stop: string;
  stopPriceType: string;
  stopTriggered: boolean;
  stopPrice: string | null;
  timeInForce: "GTC" | "IOC" | "FOK" | string;
  postOnly: boolean;
  hidden: boolean;
  iceberg: boolean;
  leverage: string;
  forceHold: boolean;
  closeOrder: boolean;
  visibleSize: number;
  clientOid: string;
  remark: string | null;
  tags: string;
  isActive: boolean;
  cancelExist: boolean;
  createdAt: number;
  updatedAt: number;
  endAt: number | null;
  orderTime: number;
  settleCurrency: string;
  marginMode: "ISOLATED" | "CROSS" | string;
  positionSide: "BOTH" | "LONG" | "SHORT" | string;
  avgDealPrice: string;
  filledSize: number;
  filledValue: string;
  status:
    | "open"
    | "closed"
    | "cancelled"
    | "filled"
    | "partial-filled"
    | string;
  reduceOnly: boolean;
};
