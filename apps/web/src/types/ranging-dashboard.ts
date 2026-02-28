export type Side = "long" | "short";

export type ProcessingStatus =
  | "no-signal"
  | "skipped-existing-position"
  | "dry-run"
  | "order-submitted"
  | "synced-position"
  | "error";

export interface PositionSnapshot {
  symbol: string;
  side: Side;
  quantity: number;
  avgEntryPrice?: number;
  isOpen: boolean;
}

export interface SignalProcessingResult {
  status: ProcessingStatus;
  side?: Side;
  message?: string;
  orderId?: string;
  clientOid?: string;
  positionSnapshot?: PositionSnapshot | null;
}

export interface BotRunRecord {
  id: string;
  botId: string;
  botName: string;
  strategyId: string;
  strategyVersion: string;
  exchangeId: string;
  accountId: string;
  symbol: string;
  generatedAtMs: number;
  recordedAtMs: number;
  latencyMs?: number;
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
  positionStatusBefore?: string;
  positionStatusAfter?: string;
  exchangeReconciliationStatus?: "ok" | "drift" | "error";
  processing: SignalProcessingResult;
  errorMessage?: string;
}

export interface AccountSummary {
  id: string;
  name: string;
  exchangeId: string;
  status: "active" | "archived";
  createdAtMs: number;
  updatedAtMs: number;
  hasAuth: {
    apiKey: boolean;
    apiSecret: boolean;
    apiPassphrase: boolean;
  };
  balance?: {
    currency: string;
    available: number;
    total: number;
    fetchedAtMs: number;
    error?: string;
  };
}

export interface BotOperationalStats {
  totalRuns: number;
  failedRuns: number;
  signalRuns: number;
  longSignals: number;
  shortSignals: number;
  noSignalRuns: number;
  orderSubmitted: number;
  dryRunSignals: number;
  skippedSignals: number;
  signalRate: number;
  failureRate: number;
}

export interface StrategyPerformanceStats {
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number;
  totalTrades: number;
  profitableBacktests: number;
  latestNetPnl?: number;
  maxDrawdownPct?: number;
}

export interface PositionLifecycleStats {
  openPositions: number;
  reducingPositions: number;
  closingPositions: number;
  reconciliationsPending: number;
  forcedCloseCount: number;
  breakevenMoves: number;
}

export interface BacktestStats {
  total: number;
  running: number;
  completed: number;
  failed: number;
  profitable: number;
  latestNetPnl?: number;
}

export interface BotAnalysisSummary {
  botId: string;
  botName: string;
  strategyId: string;
  strategyVersion: string;
  exchangeId: string;
  accountId: string;
  status?: "active" | "paused" | "archived";
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

export interface BotRecordView {
  id: string;
  name: string;
  strategyId: string;
  strategyVersion: string;
  exchangeId: string;
  accountId: string;
  symbol: string;
  status: "active" | "paused" | "archived";
  runtime: {
    executionTimeframe: string;
    executionLimit: number;
    primaryRangeTimeframe: string;
    primaryRangeLimit: number;
    secondaryRangeTimeframe: string;
    secondaryRangeLimit: number;
    dryRun?: boolean;
    marginMode?: "CROSS" | "ISOLATED";
    valueQty?: string;
  };
  createdAtMs: number;
  updatedAtMs: number;
}

export interface TradeSignalRecord {
  id: string;
  botId: string;
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
  metrics: BotOperationalStats;
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

export type BacktestStatus = "running" | "completed" | "failed";

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
  botId: string;
  botName: string;
  strategyId: string;
  strategyVersion: string;
  exchangeId: string;
  accountId: string;
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
  ai?: {
    enabled: boolean;
    lookbackCandles: number;
    cadenceBars: number;
    maxEvaluations: number;
    confidenceThreshold: number;
    modelPrimary: string;
    modelFallback: string;
    effectiveCadenceBars: number;
    plannedEvaluations: number;
    evaluationsRun: number;
    evaluationsAccepted: number;
    fallbackUsed: number;
    failed: number;
  };
  errorMessage?: string;
}

export interface BotStatsSummary {
  generatedAt: string;
  bot: {
    configured: number;
    active: number;
  };
  operations: BotOperationalStats;
  strategy: StrategyPerformanceStats;
  positions: PositionLifecycleStats;
  backtests: BacktestStats;
}

export interface StrategySummary {
  strategyId: string;
  versions: string[];
  configuredBots: number;
  activeBots: number;
  symbols: string[];
  operations: BotOperationalStats;
  strategy: StrategyPerformanceStats;
  positions: PositionLifecycleStats;
  backtests: BacktestStats;
}

export interface StrategyDetailsPayload {
  generatedAt: string;
  strategy: StrategySummary;
  bots: BotAnalysisSummary[];
  recentRuns: BotRunRecord[];
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

export type RangeValidationStatus = "pending" | "completed" | "failed";

export interface RangeValidationResult {
  isRanging: boolean;
  confidence: number;
  timeframeDetected: string;
  range: {
    val: number;
    poc: number;
    vah: number;
  };
  reasons: string[];
}

export interface RangeValidationRecord {
  id: string;
  botId: string;
  botName: string;
  strategyId: string;
  createdAtMs: number;
  status: RangeValidationStatus;
  symbol: string;
  timeframe: string;
  fromMs: number;
  toMs: number;
  candlesCount: number;
  modelPrimary: string;
  modelFallback: string;
  confidenceThreshold: number;
  finalModel?: string;
  result?: RangeValidationResult;
  errorMessage?: string;
}

export interface PositionRecord {
  id: string;
  botId: string;
  botName: string;
  strategyId: string;
  strategyVersion: string;
  exchangeId: string;
  accountId: string;
  symbol: string;
  side: Side;
  status:
    | "flat"
    | "entry-pending"
    | "open"
    | "reducing"
    | "closing"
    | "closed"
    | "reconciling"
    | "error";
  quantity: number;
  remainingQuantity: number;
  avgEntryPrice?: number;
  stopPrice?: number;
  realizedPnl: number;
  unrealizedPnl?: number;
  openedAtMs?: number;
  closedAtMs?: number;
  lastStrategyDecisionTimeMs?: number;
  lastExchangeSyncTimeMs?: number;
}

export interface OrderRecord {
  id: string;
  botId: string;
  positionId: string;
  symbol: string;
  side: Side;
  purpose: "entry" | "reduce" | "stop" | "take-profit" | "close" | "reconcile";
  status: "submitted" | "filled" | "canceled" | "rejected";
  requestedPrice?: number;
  executedPrice?: number;
  requestedQuantity?: number;
  requestedValueQty?: string;
  executedQuantity?: number;
  externalOrderId?: string;
  clientOid?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FillRecord {
  id: string;
  botId: string;
  positionId: string;
  orderId?: string;
  symbol: string;
  side: Side;
  reason: "entry" | "reduce" | "stop" | "take-profit" | "close" | "reconcile";
  source: "exchange-snapshot" | "synthetic";
  price?: number;
  quantity: number;
  createdAtMs: number;
}

export interface ReconciliationEventRecord {
  id: string;
  botId: string;
  positionId?: string;
  symbol: string;
  status: "ok" | "drift" | "error";
  message: string;
  createdAtMs: number;
}

export interface BotPositionsPayload {
  generatedAt: string;
  count: number;
  positions: PositionRecord[];
  orders: OrderRecord[];
  fills: FillRecord[];
  reconciliations: ReconciliationEventRecord[];
}
