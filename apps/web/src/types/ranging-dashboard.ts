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
