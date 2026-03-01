import { z } from "zod";

/**
 * Timeframe vocabulary documented by TAAPI for the indicator endpoints we use.
 * The API supports additional constructs in some plans, but these are the
 * intervals explicitly documented across the inspected indicator pages.
 */
export const TaapiIntervalSchema = z.enum([
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "12h",
  "1d",
  "1w",
]);
export type TaapiInterval = z.infer<typeof TaapiIntervalSchema>;

/**
 * Manual candles posted to TAAPI's "manual" REST integration.
 *
 * The documentation marks `timestamp` as optional. When present, TAAPI expects
 * it in epoch milliseconds.
 */
export const TaapiManualCandleSchema = z.object({
  timestamp: z.number().int().nonnegative().optional(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().finite().nonnegative(),
});
export type TaapiManualCandle = z.infer<typeof TaapiManualCandleSchema>;

/**
 * Common request parameters shared by TAAPI's direct GET indicator endpoints.
 */
export const TaapiDirectRequestBaseSchema = z.object({
  exchange: z.string().min(1),
  symbol: z.string().min(1),
  interval: TaapiIntervalSchema,
  backtrack: z.number().int().nonnegative().optional(),
  results: z.number().int().positive().optional(),
  addResultTimestamp: z.boolean().optional(),
  fromTimestamp: z.number().int().nonnegative().optional(),
  toTimestamp: z.number().int().nonnegative().optional(),
  chart: z.string().min(1).optional(),
});
export type TaapiDirectRequestBase = z.infer<typeof TaapiDirectRequestBaseSchema>;

/**
 * Shared request payload for the indicators whose primary customization is an
 * optional `period` parameter.
 */
export const TaapiPeriodIndicatorRequestSchema = TaapiDirectRequestBaseSchema.extend({
  period: z.number().int().positive().optional(),
});
export type TaapiPeriodIndicatorRequest = z.infer<typeof TaapiPeriodIndicatorRequestSchema>;

/**
 * Manual indicator requests operate on a caller-provided candle set instead of
 * exchange market data.
 */
export const TaapiManualIndicatorRequestSchema = z.object({
  candles: z.array(TaapiManualCandleSchema).min(1),
  period: z.number().int().positive().optional(),
});
export type TaapiManualIndicatorRequest = z.infer<typeof TaapiManualIndicatorRequestSchema>;

export const TaapiSupportedScalarIndicatorSchema = z.enum([
  "rsi",
  "mfi",
  "ema",
  "sma",
  "obv",
]);
export type TaapiSupportedScalarIndicator = z.infer<typeof TaapiSupportedScalarIndicatorSchema>;

export const TaapiSupportedStructuredIndicatorSchema = z.enum(["fibonacciretracement"]);
export type TaapiSupportedStructuredIndicator = z.infer<
  typeof TaapiSupportedStructuredIndicatorSchema
>;

/**
 * High/medium/low heuristic tiers for reversal pattern signals. This is not a
 * TAAPI field; it is our strategy-facing interpretation layer on top of TAAPI's
 * raw pattern-match values.
 */
export const TaapiReversalTierSchema = z.enum(["high", "medium", "low"]);
export type TaapiReversalTier = z.infer<typeof TaapiReversalTierSchema>;

/**
 * Pattern endpoints from TAAPI's pattern-recognition catalogue that are useful
 * as reversal cues. Continuation-only patterns are intentionally excluded.
 */
export const TaapiReversalPatternSchema = z.enum([
  "morningstar",
  "eveningstar",
  "morningdojistar",
  "eveningdojistar",
  "abandonedbaby",
  "3inside",
  "3outside",
  "breakaway",
  "kicking",
  "kickingbylength",
  "tristar",
  "3linestrike",
  "3blackcrows",
  "3whitesoldiers",
  "identical3crows",
  "engulfing",
  "harami",
  "haramicross",
  "piercing",
  "darkcloudcover",
  "counterattack",
  "belthold",
  "2crows",
  "upsidegap2crows",
  "concealbabyswall",
  "ladderbottom",
  "sticksandwich",
  "matchinglow",
  "homingpigeon",
  "unique3river",
  "stalledpattern",
  "hikkake",
  "hikkakemod",
  "hammer",
  "invertedhammer",
  "shootingstar",
  "hangingman",
  "doji",
  "longleggeddoji",
  "rickshawman",
  "dragonflydoji",
  "gravestonedoji",
  "dojistar",
  "spinningtop",
  "highwave",
  "longline",
  "shortline",
  "marubozu",
  "closingmarubozu",
]);
export type TaapiReversalPattern = z.infer<typeof TaapiReversalPatternSchema>;

/**
 * Latest scalar indicator response shape used by RSI, MFI, EMA, SMA and OBV.
 */
export const TaapiScalarLatestResponseSchema = z.object({
  value: z.number().finite(),
});
export type TaapiScalarLatestResponse = z.infer<typeof TaapiScalarLatestResponseSchema>;

/**
 * Historical scalar response shape documented by TAAPI when `results` is used
 * for scalar indicators.
 */
export const TaapiScalarHistoryItemSchema = z.object({
  value: z.number().finite(),
  backtrack: z.number().int().nonnegative(),
});
export const TaapiScalarHistoryResponseSchema = z.array(TaapiScalarHistoryItemSchema);
export type TaapiScalarHistoryResponse = z.infer<typeof TaapiScalarHistoryResponseSchema>;

export const TaapiFibTrendSchema = z.enum(["UPTREND", "DOWNTREND"]);

/**
 * Latest Fibonacci retracement response shape documented by TAAPI.
 */
export const TaapiFibonacciLatestResponseSchema = z.object({
  value: z.number().finite(),
  trend: TaapiFibTrendSchema,
  startPrice: z.number().finite(),
  endPrice: z.number().finite(),
  startTimestamp: z.number().int(),
  endTimestamp: z.number().int(),
});
export type TaapiFibonacciLatestResponse = z.infer<typeof TaapiFibonacciLatestResponseSchema>;

/**
 * Historical Fibonacci response when `results` is used.
 */
export const TaapiFibonacciHistoryItemSchema = TaapiFibonacciLatestResponseSchema.extend({
  backtrack: z.number().int().nonnegative(),
});
export const TaapiFibonacciHistoryResponseSchema = z.array(
  TaapiFibonacciHistoryItemSchema,
);
export type TaapiFibonacciHistoryResponse = z.infer<typeof TaapiFibonacciHistoryResponseSchema>;

/**
 * Pattern endpoints return match quality values like `100`, `0`, `-100`,
 * sometimes partial matches such as `80`. The docs present latest values as
 * strings, so we normalize both string and numeric payloads.
 */
export const TaapiPatternLatestResponseSchema = z.object({
  value: z.union([z.string(), z.number()]).transform((value) => Number(value)),
});
export type TaapiPatternLatestResponse = z.infer<typeof TaapiPatternLatestResponseSchema>;

/**
 * Pattern history response shape shown by TAAPI when `results` is used.
 */
export const TaapiPatternHistoryResponseSchema = z.object({
  value: z.array(z.union([z.string(), z.number()]).transform((value) => Number(value))),
});
export type TaapiPatternHistoryResponse = z.infer<typeof TaapiPatternHistoryResponseSchema>;

/**
 * One indicator request within TAAPI's bulk endpoint. The same shape is used
 * for scalar indicators and pattern-recognition endpoints because TAAPI models
 * them uniformly at the request layer.
 */
export const TaapiBulkIndicatorSchema = z.object({
  id: z.string().min(1).optional(),
  indicator: z.string().min(1),
  period: z.number().int().positive().optional(),
  backtrack: z.number().int().nonnegative().optional(),
  results: z.number().int().positive().optional(),
  chart: z.string().min(1).optional(),
});
export type TaapiBulkIndicator = z.infer<typeof TaapiBulkIndicatorSchema>;

/**
 * One construct in a TAAPI bulk request.
 */
export const TaapiBulkConstructSchema = z.object({
  exchange: z.string().min(1),
  symbol: z.string().min(1),
  interval: TaapiIntervalSchema,
  indicators: z.array(TaapiBulkIndicatorSchema).min(1),
});
export type TaapiBulkConstruct = z.infer<typeof TaapiBulkConstructSchema>;

export const TaapiBulkRequestSchema = z.object({
  construct: z.union([TaapiBulkConstructSchema, z.array(TaapiBulkConstructSchema).min(1)]),
});
export type TaapiBulkRequest = z.infer<typeof TaapiBulkRequestSchema>;

export const TaapiBulkItemSchema = z.object({
  id: z.string().min(1),
  result: z.record(z.string(), z.unknown()),
  errors: z.array(z.string()),
});
export const TaapiBulkResponseSchema = z.object({
  data: z.array(TaapiBulkItemSchema),
});
export type TaapiBulkResponse = z.infer<typeof TaapiBulkResponseSchema>;

/**
 * Normalized reversal signal extracted from one TAAPI pattern endpoint.
 */
export const TaapiReversalSignalSchema = z.object({
  pattern: TaapiReversalPatternSchema,
  tier: TaapiReversalTierSchema,
  match: z.number().finite(),
  direction: z.enum(["bullish", "bearish"]),
  matchQuality: z.number().min(0).max(1),
});
export type TaapiReversalSignal = z.infer<typeof TaapiReversalSignalSchema>;
