import { z } from "zod";
import { CandleSchema, TimeframeSchema, type Candle, type Timeframe } from "@repo/trading-core";

/**
 * Indicator identifiers supported by the local context-building layer.
 *
 * This list is intentionally explicit so strategy context requirements remain
 * stable and serializable.
 */
export const IndicatorIdSchema = z.enum([
  "rsi",
  "mfi",
  "obv",
  "wavetrend",
  "ema",
  "sma",
  "fibonacciretracement",
  "rsidivergence",
  "mfidivergence",
  "wavetrenddivergence",
]);
export type IndicatorId = z.infer<typeof IndicatorIdSchema>;

/**
 * A single indicator computation request. The `params` bag is kept generic so
 * providers can support parameterized indicators such as `ema(20)` or
 * `wavetrend(10,21)`.
 */
export const IndicatorRequestSchema = z.object({
  indicatorId: IndicatorIdSchema,
  params: z.record(z.string(), z.unknown()).default({}),
});
export type IndicatorRequest = z.infer<typeof IndicatorRequestSchema>;

/**
 * Provider contract for indicator computation.
 *
 * Providers are pure from the caller's perspective: given candles and a
 * request, they return a serializable latest-value payload. This abstraction
 * lets us switch later between local math, TAAPI, or cached indicator pools
 * without changing the context builder contract.
 */
export interface IndicatorProvider {
  computeLatest(input: {
    candles: Candle[];
    request: IndicatorRequest;
  }): Record<string, unknown>;
}

/**
 * A storable, per-timeframe feature snapshot used as part of a multi-timeframe
 * decision context.
 */
export const TimeframeContextSchema = z.object({
  symbol: z.string().min(1),
  timeframe: TimeframeSchema,
  closedCandleTime: z.number().int().nonnegative(),
  price: z.number().finite(),
  candles: z.array(CandleSchema),
  indicators: z.record(z.string(), z.unknown()),
  divergences: z.record(z.string(), z.boolean()),
  patterns: z.record(z.string(), z.boolean()),
  levels: z.record(z.string(), z.unknown()),
  contextVersion: z.string().min(1),
});
export type TimeframeContext = z.infer<typeof TimeframeContextSchema>;

/**
 * Aggregated decision input spanning one execution timeframe and any number of
 * supporting higher/lower timeframe contexts.
 */
export const DecisionContextSchema = z.object({
  symbol: z.string().min(1),
  decisionTime: z.number().int().nonnegative(),
  executionTimeframe: TimeframeSchema,
  contexts: z.record(z.string(), TimeframeContextSchema),
});
export type DecisionContext = z.infer<typeof DecisionContextSchema>;

/**
 * Input contract used by the timeframe context builder. This stays infra-free:
 * callers provide raw candles and an indicator provider, and receive a fully
 * serializable timeframe context.
 */
export interface BuildTimeframeContextInput {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  contextVersion?: string;
  indicatorProvider: IndicatorProvider;
  indicatorRequests: IndicatorRequest[];
}
