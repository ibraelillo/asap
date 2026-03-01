import type { Candle, Timeframe } from "@repo/trading-core";
import { DecisionContextSchema, TimeframeContextSchema, type BuildTimeframeContextInput, type DecisionContext, type TimeframeContext } from "./types";

function detectHammer(candle: Candle): boolean {
  const body = Math.abs(candle.close - candle.open);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  return lowerWick > body * 2 && upperWick <= body;
}

function detectInvertedHammer(candle: Candle): boolean {
  const body = Math.abs(candle.close - candle.open);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  return upperWick > body * 2 && lowerWick <= body;
}

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

function detectBullishDivergence(candles: Candle[], indicatorValue: number): boolean {
  const last = candles.at(-1);
  const previous = candles.at(-5);
  if (!last || !previous) return false;
  return last.low < previous.low && indicatorValue > 50;
}

function detectBearishDivergence(candles: Candle[], indicatorValue: number): boolean {
  const last = candles.at(-1);
  const previous = candles.at(-5);
  if (!last || !previous) return false;
  return last.high > previous.high && indicatorValue < 50;
}

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

  return TimeframeContextSchema.parse({
    symbol: input.symbol,
    timeframe: input.timeframe,
    closedCandleTime: lastCandle.time,
    price: lastCandle.close,
    candles: input.candles.slice(-20),
    indicators,
    divergences: {
      rsiBullish: detectBullishDivergence(input.candles, rsiValue),
      rsiBearish: detectBearishDivergence(input.candles, rsiValue),
      mfiBullish: detectBullishDivergence(input.candles, mfiValue),
      mfiBearish: detectBearishDivergence(input.candles, mfiValue),
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

export function aggregateDecisionContext(input: {
  symbol: string;
  decisionTime: number;
  executionTimeframe: Timeframe;
  contexts: Record<string, TimeframeContext>;
}): DecisionContext {
  return DecisionContextSchema.parse(input);
}
