import type { Candle } from "@repo/trading-core";
import type { IndicatorProvider, IndicatorRequest } from "./types";

/**
 * Uses the candle close as the default source series for indicators that only
 * need a single scalar input.
 */
function getSourceValue(candle: Candle): number {
  return candle.close;
}

/**
 * Simple moving average over the latest `length` values. When fewer values are
 * available, it degrades gracefully to the mean of the available slice so
 * context building still works on short histories.
 */
function sma(values: number[], length: number): number {
  const start = Math.max(0, values.length - length);
  const slice = values.slice(start);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

/**
 * Exponential moving average with the standard `2 / (length + 1)` smoothing
 * factor. The first value seeds the series to keep the function deterministic
 * and side-effect free.
 */
function ema(values: number[], length: number): number {
  if (values.length === 0) return 0;
  const alpha = 2 / (length + 1);
  let current = values[0] ?? 0;
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? current;
    current = value * alpha + current * (1 - alpha);
  }
  return current;
}

/**
 * Relative Strength Index computed from the latest `length` deltas.
 *
 * This implementation is intentionally lightweight and deterministic. It is
 * suitable for building stored decision contexts, not for exact exchange-side
 * indicator parity claims.
 */
function rsi(candles: Candle[], length: number): number {
  if (candles.length < 2) return 50;
  let gains = 0;
  let losses = 0;
  const start = Math.max(1, candles.length - length);
  for (let index = start; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (!previous || !current) continue;
    const delta = current.close - previous.close;
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/**
 * Money Flow Index computed from typical price and volume.
 */
function mfi(candles: Candle[], length: number): number {
  if (candles.length < 2) return 50;
  let positiveFlow = 0;
  let negativeFlow = 0;
  const start = Math.max(1, candles.length - length);
  for (let index = start; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (!previous || !current) continue;
    const previousTypical = (previous.high + previous.low + previous.close) / 3;
    const currentTypical = (current.high + current.low + current.close) / 3;
    const flow = currentTypical * current.volume;
    if (currentTypical >= previousTypical) positiveFlow += flow;
    else negativeFlow += flow;
  }
  if (negativeFlow === 0) return 100;
  const ratio = positiveFlow / negativeFlow;
  return 100 - 100 / (1 + ratio);
}

/**
 * On-Balance Volume over the provided candle window.
 */
function obv(candles: Candle[]): number {
  let total = 0;
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (!previous || !current) continue;
    if (current.close > previous.close) total += current.volume;
    else if (current.close < previous.close) total -= current.volume;
  }
  return total;
}

/**
 * Returns the latest WaveTrend values. The function keeps only the latest
 * useful values because the market-context package stores compact snapshots,
 * not full indicator series.
 */
function waveTrend(candles: Candle[], channelLength: number, averageLength: number): Record<string, number> {
  const prices = candles.map((candle) => (candle.high + candle.low + candle.close) / 3);
  const esa = ema(prices, channelLength);
  const deviations = prices.map((price) => Math.abs(price - esa));
  const d = ema(deviations, channelLength) || 1;
  const ciSeries = prices.map((price) => (price - esa) / (0.015 * d));
  const wt1 = ema(ciSeries, averageLength);
  const wt2 = sma([...ciSeries, wt1], 4);
  return { wt1, wt2 };
}

/**
 * Detects coarse bullish/bearish oscillator divergence by comparing the latest
 * price extremum with an earlier extremum and checking whether the oscillator
 * improved or deteriorated over the same window.
 *
 * This is deliberately simple. The goal in this package is to produce stable,
 * storable features that strategies can refine later, not to claim exhaustive
 * pattern fidelity.
 */
function detectOscillatorDivergence(input: {
  candles: Candle[];
  lookbackBars: number;
  oscillatorAt: (candles: Candle[]) => number;
}): { bullish: boolean; bearish: boolean } {
  const { candles, lookbackBars, oscillatorAt } = input;
  if (candles.length < lookbackBars + 2) {
    return { bullish: false, bearish: false };
  }

  const latestCandle = candles.at(-1);
  const referenceIndex = candles.length - lookbackBars;
  const referenceCandle = candles[referenceIndex];
  if (!latestCandle || !referenceCandle) {
    return { bullish: false, bearish: false };
  }

  const currentOscillator = oscillatorAt(candles);
  const referenceOscillator = oscillatorAt(candles.slice(0, referenceIndex + 1));

  return {
    bullish: latestCandle.low < referenceCandle.low && currentOscillator > referenceOscillator,
    bearish: latestCandle.high > referenceCandle.high && currentOscillator < referenceOscillator,
  };
}

/**
 * Computes the latest Fibonacci retracement levels over the provided candle
 * range. These are stored as explicit levels so strategies can reason about
 * them later without recomputing the range every time.
 */
function fibonacciRetracement(candles: Candle[]): Record<string, number> {
  const highest = candles.reduce((acc, candle) => Math.max(acc, candle.high), Number.NEGATIVE_INFINITY);
  const lowest = candles.reduce((acc, candle) => Math.min(acc, candle.low), Number.POSITIVE_INFINITY);
  const range = highest - lowest;
  return {
    r236: highest - range * 0.236,
    r382: highest - range * 0.382,
    r5: highest - range * 0.5,
    r618: highest - range * 0.618,
  };
}

/**
 * Pure local indicator provider used for deterministic tests, research, and
 * as the default implementation before plugging in external vendors.
 */
export class LocalIndicatorProvider implements IndicatorProvider {
  /**
   * Computes the latest value payload for the requested indicator.
   *
   * Payloads are kept serializable and compact so they can be embedded directly
   * into timeframe contexts and later persisted as part of decision history.
   */
  computeLatest(input: { candles: Candle[]; request: IndicatorRequest }): Record<string, unknown> {
    const values = input.candles.map(getSourceValue);
    const length = Number(input.request.params.length ?? 14);
    const lookbackBars = Number(input.request.params.lookbackBars ?? 5);

    switch (input.request.indicatorId) {
      case "ema":
        return { value: ema(values, length) };
      case "sma":
        return { value: sma(values, length) };
      case "rsi":
        return { value: rsi(input.candles, length) };
      case "mfi":
        return { value: mfi(input.candles, length) };
      case "obv":
        return { value: obv(input.candles) };
      case "wavetrend": {
        const channelLength = Number(input.request.params.channelLength ?? 10);
        const averageLength = Number(input.request.params.averageLength ?? 21);
        return waveTrend(input.candles, channelLength, averageLength);
      }
      case "fibonacciretracement":
        return fibonacciRetracement(input.candles);
      case "rsidivergence":
        return detectOscillatorDivergence({
          candles: input.candles,
          lookbackBars,
          oscillatorAt: (candles) => rsi(candles, length),
        });
      case "mfidivergence":
        return detectOscillatorDivergence({
          candles: input.candles,
          lookbackBars,
          oscillatorAt: (candles) => mfi(candles, length),
        });
      case "wavetrenddivergence": {
        const channelLength = Number(input.request.params.channelLength ?? 10);
        const averageLength = Number(input.request.params.averageLength ?? 21);
        return detectOscillatorDivergence({
          candles: input.candles,
          lookbackBars,
          oscillatorAt: (candles) =>
            Number(waveTrend(candles, channelLength, averageLength).wt1 ?? 0),
        });
      }
      default:
        return { value: 0 };
    }
  }
}
