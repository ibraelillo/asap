import type { Side } from "@repo/ranging-core";
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
