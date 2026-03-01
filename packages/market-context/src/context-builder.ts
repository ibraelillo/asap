import type { Candle, Timeframe } from "@repo/trading-core";
import { DecisionContextSchema, TimeframeContextSchema, type BuildTimeframeContextInput, type DecisionContext, type TimeframeContext } from "./types";

/**
 * Hammer detection focused on a large lower wick relative to the body. The
 * context layer only needs a boolean flag here; detailed candlestick semantics
 * belong to strategy refinement, not context storage.
 */
function detectHammer(candle: Candle): boolean {
  const body = Math.abs(candle.close - candle.open);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  return lowerWick > body * 2 && upperWick <= body;
}

/**
 * Inverted hammer detection using the mirrored wick/body relationship.
 */
function detectInvertedHammer(candle: Candle): boolean {
  const body = Math.abs(candle.close - candle.open);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  return upperWick > body * 2 && lowerWick <= body;
}

/**
 * Minimal morning star detector using the last three candles.
 */
function detectMorningStar(candles: Candle[]): boolean {
  const a = candles.at(-3);
  const b = candles.at(-2);
  const c = candles.at(-1);
  if (!a || !b || !c) return false;
  const firstBearish = a.close < a.open;
  const secondSmallBody = Math.abs(b.close - b.open) < Math.abs(a.close - a.open) * 0.5;
  const thirdBullishRecovery = c.close > c.open && c.close >= (a.open + a.close) / 2;
  return firstBearish && secondSmallBody && thirdBullishRecovery;
}

/**
 * Builds a storable single-timeframe context from candles plus indicator
 * requests.
 *
 * The output is intentionally compact but complete enough for later decision
 * replay: it contains the last candle time/price, a bounded candle window,
 * indicator payloads, higher-order features, and explicit versioning.
 */
export function buildTimeframeContext(input: BuildTimeframeContextInput): TimeframeContext {
  const lastCandle = input.candles.at(-1);
  if (!lastCandle) {
    throw new Error(`Cannot build timeframe context without candles for ${input.symbol} ${input.timeframe}`);
  }

  const indicators = Object.fromEntries(
    input.indicatorRequests.map((request) => [
      request.indicatorId,
      input.indicatorProvider.computeLatest({ candles: input.candles, request }),
    ]),
  );

  const rsiValue = Number((indicators.rsi as { value?: number } | undefined)?.value ?? 50);
  const mfiValue = Number((indicators.mfi as { value?: number } | undefined)?.value ?? 50);
  const rsiDivergence = indicators.rsidivergence as
    | { bullish?: boolean; bearish?: boolean }
    | undefined;
  const mfiDivergence = indicators.mfidivergence as
    | { bullish?: boolean; bearish?: boolean }
    | undefined;
  const wtDivergence = indicators.wavetrenddivergence as
    | { bullish?: boolean; bearish?: boolean }
    | undefined;

  return TimeframeContextSchema.parse({
    symbol: input.symbol,
    timeframe: input.timeframe,
    closedCandleTime: lastCandle.time,
    price: lastCandle.close,
    candles: input.candles.slice(-20),
    indicators,
    divergences: {
      rsiBullish: rsiDivergence?.bullish ?? rsiValue > 50,
      rsiBearish: rsiDivergence?.bearish ?? rsiValue < 50,
      mfiBullish: mfiDivergence?.bullish ?? mfiValue > 50,
      mfiBearish: mfiDivergence?.bearish ?? mfiValue < 50,
      wtBullish: wtDivergence?.bullish ?? false,
      wtBearish: wtDivergence?.bearish ?? false,
    },
    patterns: {
      hammer: detectHammer(lastCandle),
      invertedHammer: detectInvertedHammer(lastCandle),
      morningStar: detectMorningStar(input.candles),
    },
    levels: {
      fibonacciretracement: indicators.fibonacciretracement,
    },
    contextVersion: input.contextVersion ?? "context-v1",
  });
}

/**
 * Aggregates multiple timeframe contexts into one decision input object.
 *
 * This is the shape strategies should consume in the next architectural phase:
 * the decision engine receives prepared context instead of fetching or
 * computing data on demand.
 */
export function aggregateDecisionContext(input: {
  symbol: string;
  decisionTime: number;
  executionTimeframe: Timeframe;
  contexts: Record<string, TimeframeContext>;
}): DecisionContext {
  return DecisionContextSchema.parse(input);
}
