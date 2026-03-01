import { z } from "zod";
import { CandleSchema, TimeframeSchema, type Candle, type Timeframe } from "@repo/trading-core";

export const IndicatorIdSchema = z.enum([
  "rsi",
  "mfi",
  "obv",
  "wavetrend",
  "ema",
  "sma",
  "fibonacciretracement",
]);
export type IndicatorId = z.infer<typeof IndicatorIdSchema>;

export const IndicatorRequestSchema = z.object({
  indicatorId: IndicatorIdSchema,
  params: z.record(z.string(), z.unknown()).default({}),
});
export type IndicatorRequest = z.infer<typeof IndicatorRequestSchema>;

export interface IndicatorProvider {
  computeLatest(input: {
    candles: Candle[];
    request: IndicatorRequest;
  }): Record<string, number>;
}

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

export const DecisionContextSchema = z.object({
  symbol: z.string().min(1),
  decisionTime: z.number().int().nonnegative(),
  executionTimeframe: TimeframeSchema,
  contexts: z.record(z.string(), TimeframeContextSchema),
});
export type DecisionContext = z.infer<typeof DecisionContextSchema>;

export interface BuildTimeframeContextInput {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  contextVersion?: string;
  indicatorProvider: IndicatorProvider;
  indicatorRequests: IndicatorRequest[];
}
