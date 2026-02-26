import type {
  Candle,
  EntryDecision,
  RangingBotApi,
  SignalSnapshot,
  Side,
} from "@repo/ranging-core";

export type OrchestratorTimeframe =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "1w";

export interface KlineQuery {
  symbol: string;
  timeframe: OrchestratorTimeframe;
  limit: number;
  endTimeMs?: number;
}

export interface ExchangeKlineProvider {
  fetchKlines(query: KlineQuery): Promise<Candle[]>;
}

export interface StrategySignalEvent {
  symbol: string;
  generatedAtMs: number;
  decision: EntryDecision;
  snapshot: SignalSnapshot;
  processing?: SignalProcessingResult;
}

export type SignalProcessingStatus =
  | "no-signal"
  | "skipped-existing-position"
  | "dry-run"
  | "order-submitted"
  | "error";

export interface SignalProcessingResult {
  status: SignalProcessingStatus;
  side?: Side;
  message?: string;
  orderId?: string;
  clientOid?: string;
}

export interface SignalProcessor {
  process(event: StrategySignalEvent): Promise<SignalProcessingResult>;
}

export interface OrchestratorRunInput {
  symbol: string;
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
  executionLimit: number;
  primaryRangeLimit: number;
  secondaryRangeLimit: number;
  endTimeMs?: number;
}

export interface OrchestratorDependencies {
  bot: RangingBotApi;
  klineProvider: ExchangeKlineProvider;
  signalProcessor: SignalProcessor;
}
