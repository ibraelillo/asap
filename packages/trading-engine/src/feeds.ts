import { createHash } from "node:crypto";
import type { Candle, Timeframe } from "./types";

export interface CandleFeedRequirement {
  role: string;
  timeframe: Timeframe;
  lookbackBars: number;
}

export interface IndicatorFeedRequirement {
  role: string;
  timeframe: Timeframe;
  indicatorId: string;
  params: Record<string, unknown>;
  lookbackBars: number;
  source?:
    | "open"
    | "high"
    | "low"
    | "close"
    | "hl2"
    | "hlc3"
    | "ohlc4"
    | string;
}

export interface StrategyFeedRequirements {
  candles: CandleFeedRequirement[];
  indicators: IndicatorFeedRequirement[];
}

export interface CandleFeedSnapshot {
  exchangeId: string;
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  fromMs: number;
  toMs: number;
  generatedAt: string;
  lastClosedCandleTime: number;
}

export interface IndicatorFeedSnapshotMeta {
  exchangeId: string;
  symbol: string;
  timeframe: Timeframe;
  indicatorId: string;
  paramsHash: string;
  lastComputedCandleTime?: number;
  status: "pending" | "ready" | "stale" | "error";
  storageKey?: string;
  errorMessage?: string;
}

export interface IndicatorFeedSnapshot {
  exchangeId: string;
  symbol: string;
  timeframe: Timeframe;
  indicatorId: string;
  paramsHash: string;
  generatedAt: string;
  lastComputedCandleTime: number;
  times: number[];
  outputs: Record<string, number[]>;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function createIndicatorParamsHash(input: {
  indicatorId: string;
  source?: string;
  params: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(
      stableStringify({
        indicatorId: input.indicatorId,
        source: input.source ?? "close",
        params: input.params,
      }),
    )
    .digest("hex");
}
