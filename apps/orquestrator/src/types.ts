/**
 * WebSocket Event Types
 */

export interface PositionEvent {
  subject: "position.change" | "position.closed";
  data: {
    symbol: string;
    side: "long" | "short";
    qty: string;
    avgEntryPrice: string;
    realizedPnl: string;
    unrealizedPnl: string;
    leverage: string;
    liquidationPrice: string;
    markPrice: string;
  };
}

export interface OrderEvent {
  subject: "orderChange";
  data: {
    orderId: string;
    symbol: string;
    side: "buy" | "sell";
    type: "limit" | "market";
    status: "open" | "filled" | "canceled";
    price: string;
    size: string;
    filledSize: string;
    remainSize: string;
    timestamp: number;
  };
}

export interface TickerEvent {
  subject: "ticker";
  data: {
    symbol: string;
    bestAskPrice: string;
    bestBidPrice: string;
    lastPrice: string;
    volume: string;
  };
}

/**
 * EventBridge Event Types
 */

export interface PositionChangedEvent {
  symbol: string;
  position: PositionEvent["data"];
  timestamp: number;
}

export interface PositionClosedEvent {
  symbol: string;
  position: PositionEvent["data"];
  timestamp: number;
}

export interface OrderFilledEvent {
  symbol: string;
  order: OrderEvent["data"];
  timestamp: number;
}

export interface TickerUpdatedEvent {
  symbol: string;
  price: string;
  timestamp: number;
}
