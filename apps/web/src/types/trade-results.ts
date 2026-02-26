export type TradeSide = "long" | "short";

export interface TradeRecord {
  id: string;
  symbol: string;
  side: TradeSide;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  netPnl: number;
  fees: number;
  exitReason?: string;
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface TradePayload {
  source?: string;
  generatedAt?: string;
  initialEquity?: number;
  trades: TradeRecord[];
  equityCurve?: EquityPoint[];
}

export interface TradeMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdownPct: number;
  endingEquity: number;
}

export interface SymbolBreakdown {
  symbol: string;
  trades: number;
  wins: number;
  winRate: number;
  netPnl: number;
}
