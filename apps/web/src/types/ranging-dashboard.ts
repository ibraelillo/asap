export type Side = "long" | "short";

export type ProcessingStatus =
  | "no-signal"
  | "skipped-existing-position"
  | "dry-run"
  | "order-submitted"
  | "error";

export interface SignalProcessingResult {
  status: ProcessingStatus;
  side?: Side;
  message?: string;
  orderId?: string;
  clientOid?: string;
}

export interface BotRunRecord {
  symbol: string;
  generatedAtMs: number;
  recordedAtMs: number;
  runStatus: "ok" | "failed";

  executionTimeframe: string;
  primaryRangeTimeframe: string;
  secondaryRangeTimeframe: string;

  signal: Side | null;
  reasons: string[];

  price?: number;
  rangeVal?: number;
  rangeVah?: number;
  rangePoc?: number;
  rangeIsAligned?: boolean;
  rangeOverlapRatio?: number;

  bullishDivergence?: boolean;
  bearishDivergence?: boolean;
  bullishSfp?: boolean;
  bearishSfp?: boolean;
  moneyFlowSlope?: number;

  processing: SignalProcessingResult;
  errorMessage?: string;
}

export interface DashboardMetrics {
  totalRuns: number;
  noSignalRuns: number;
  signalRuns: number;
  longSignals: number;
  shortSignals: number;
  orderSubmitted: number;
  dryRunSignals: number;
  skippedSignals: number;
  failedRuns: number;
}

export interface BotAnalysisSummary {
  symbol: string;
  generatedAtMs?: number;
  signal: Side | null;
  runStatus: "ok" | "failed" | "idle";
  reasons: string[];
  price?: number;
  rangeVal?: number;
  rangeVah?: number;
  rangePoc?: number;
  rangeIsAligned?: boolean;
  moneyFlowSlope?: number;
  bullishDivergence?: boolean;
  bearishDivergence?: boolean;
  bullishSfp?: boolean;
  bearishSfp?: boolean;
  processingStatus: ProcessingStatus | "idle";
  processingMessage?: string;
  orderId?: string;
}

export interface TradeSignalRecord {
  id: string;
  symbol: string;
  side: Side;
  generatedAtMs: number;
  price?: number;
  processingStatus: ProcessingStatus;
  orderId?: string;
  clientOid?: string;
  reasons: string[];
}

export interface KlineCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DashboardPayload {
  generatedAt: string;
  metrics: DashboardMetrics;
  bots: BotAnalysisSummary[];
  recentRuns: BotRunRecord[];
  trades: TradeSignalRecord[];
}

export interface TradeAnalysisPayload {
  generatedAt: string;
  trade: TradeSignalRecord;
  run: BotRunRecord;
  timeframe: string;
  barsBefore: number;
  barsAfter: number;
  klines: KlineCandle[];
}

export type BacktestStatus = "completed" | "failed";

export interface KlineCacheReference {
  key: string;
  symbol: string;
  timeframe: string;
  fromMs: number;
  toMs: number;
  candleCount: number;
  url?: string;
}

export interface BacktestRecord {
  id: string;
  createdAtMs: number;
  status: BacktestStatus;
  symbol: string;
  fromMs: number;
  toMs: number;
  executionTimeframe: string;
  primaryRangeTimeframe: string;
  secondaryRangeTimeframe: string;
  initialEquity: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  maxDrawdownPct: number;
  endingEquity: number;
  klineRefs?: KlineCacheReference[];
  errorMessage?: string;
}

export interface BotStatsSummary {
  generatedAt: string;
  configuredBots: number;
  runsInWindow: number;
  signalsInWindow: number;
  failuresInWindow: number;
  signalRate: number;
  failureRate: number;
  backtests: {
    total: number;
    profitable: number;
    latestNetPnl?: number;
  };
}

export interface BacktestExit {
  reason: "tp1" | "tp2" | "stop" | "signal" | "end";
  time: number;
  price: number;
  quantity: number;
  grossPnl: number;
  fee: number;
  netPnl: number;
}

export interface BacktestTrade {
  id: number;
  side: Side;
  entryTime: number;
  entryPrice: number;
  stopPriceAtEntry: number;
  quantity: number;
  entryFee: number;
  exits: BacktestExit[];
  closeTime: number;
  closePrice: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  rangeLevels?: {
    val: number;
    vah: number;
    poc: number;
  };
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface BacktestDetailsPayload {
  generatedAt: string;
  backtest: BacktestRecord;
  chartTimeframe: string;
  candles: KlineCandle[];
  candlesRef?: KlineCacheReference;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  replayError?: string;
}
