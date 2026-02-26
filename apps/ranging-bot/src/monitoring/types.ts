import type { BacktestExit, BacktestTrade, EquityPoint, Side, Candle } from "@repo/ranging-core";
import type { OrchestratorTimeframe, SignalProcessingResult } from "../contracts";

export interface BotRunRecord {
  symbol: string;
  generatedAtMs: number;
  recordedAtMs: number;
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
  processingStatus: SignalProcessingResult["status"] | "idle";
  processingMessage?: string;
  orderId?: string;
}

export interface TradeSignalRecord {
  id: string;
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
  metrics: DashboardMetrics;
  bots: BotAnalysisSummary[];
  recentRuns: BotRunRecord[];
  trades: TradeSignalRecord[];
}

export type BacktestStatus = "completed" | "failed";

export interface KlineCacheReference {
  key: string;
  symbol: string;
  timeframe: OrchestratorTimeframe;
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

export interface BacktestTradeView extends Omit<BacktestTrade, "exits"> {
  exits: BacktestExit[];
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
