import type {
  BotDefinition,
  Candle,
  EquityPoint,
  ExchangeAccount,
  ExchangeSymbolSummary,
  Side,
} from "@repo/trading-engine";
import type {
  OrchestratorTimeframe,
  SignalProcessingResult,
} from "../contracts";

export interface BotRecord extends BotDefinition {
  runtime: {
    executionTimeframe: OrchestratorTimeframe;
    executionLimit: number;
    primaryRangeTimeframe: OrchestratorTimeframe;
    primaryRangeLimit: number;
    secondaryRangeTimeframe: OrchestratorTimeframe;
    secondaryRangeLimit: number;
    dryRun?: boolean;
    marginMode?: "CROSS" | "ISOLATED";
    valueQty?: string;
  };
}

export interface AccountAuthRecord {
  [key: string]: string | undefined;
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
}

export interface AccountRecord extends ExchangeAccount<AccountAuthRecord> {
  auth: AccountAuthRecord;
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

export interface AccountSymbolSummary extends ExchangeSymbolSummary {}

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

  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;

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
  processingStatus: SignalProcessingResult["status"] | "idle";
  processingMessage?: string;
  orderId?: string;
}

export interface TradeSignalRecord {
  id: string;
  botId: string;
  symbol: string;
  side: Side;
  generatedAtMs: number;
  price?: number;
  processingStatus: SignalProcessingResult["status"];
  orderId?: string;
  clientOid?: string;
  reasons: string[];
}

export interface DashboardPayload {
  generatedAt: string;
  metrics: BotOperationalStats;
  bots: BotAnalysisSummary[];
  recentRuns: BotRunRecord[];
  trades: TradeSignalRecord[];
}

export type BacktestStatus = "running" | "completed" | "failed";

export interface KlineCacheReference {
  key: string;
  symbol: string;
  timeframe: OrchestratorTimeframe;
  fromMs: number;
  toMs: number;
  candleCount: number;
  url?: string;
}

export interface BacktestAiConfig {
  enabled: boolean;
  lookbackCandles: number;
  cadenceBars: number;
  maxEvaluations: number;
  confidenceThreshold: number;
  modelPrimary: string;
  modelFallback: string;
}

export interface BacktestAiEvaluation {
  atIndex: number;
  atTime: number;
  finalModel: string;
  usedFallback: boolean;
  isRanging: boolean;
  confidence: number;
  accepted: boolean;
  range: {
    val: number;
    poc: number;
    vah: number;
  };
  reasons: string[];
  errorMessage?: string;
}

export interface BacktestAiSummary extends BacktestAiConfig {
  effectiveCadenceBars: number;
  plannedEvaluations: number;
  evaluationsRun: number;
  evaluationsAccepted: number;
  fallbackUsed: number;
  failed: number;
  evaluations?: BacktestAiEvaluation[];
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
  strategyConfig?: Record<string, unknown>;
  fromMs: number;
  toMs: number;
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
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
  ai?: BacktestAiSummary;

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
  label: string;
  description: string;
  manifestVersion: string;
  configuredVersions: string[];
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

export interface BacktestTradeView {
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

export interface BacktestDetailsPayload {
  generatedAt: string;
  backtest: BacktestRecord;
  chartTimeframe: OrchestratorTimeframe;
  candles: Candle[];
  candlesRef?: KlineCacheReference;
  trades: BacktestTradeView[];
  equityCurve: EquityPoint[];
  replayError?: string;
}

export type RangeValidationStatus = "pending" | "completed" | "failed";

export interface RangeValidationResult {
  isRanging: boolean;
  confidence: number;
  timeframeDetected: OrchestratorTimeframe | "unknown";
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
  symbol: string;
  createdAtMs: number;
  status: RangeValidationStatus;
  timeframe: OrchestratorTimeframe;
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
  strategyContext?: Record<string, unknown>;
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

export interface ProcessingCursorRecord {
  symbol: string;
  timeframe: OrchestratorTimeframe;
  lastProcessedCandleCloseMs: number;
  lastRunGeneratedAtMs?: number;
  updatedAtMs: number;
}
