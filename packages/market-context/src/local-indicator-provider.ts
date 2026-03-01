import type { Candle } from "@repo/trading-core";
import type { IndicatorProvider, IndicatorRequest } from "./types";

function getSourceValue(candle: Candle): number {
  return candle.close;
}

function sma(values: number[], length: number): number {
  const start = Math.max(0, values.length - length);
  const slice = values.slice(start);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

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

export class LocalIndicatorProvider implements IndicatorProvider {
  computeLatest(input: { candles: Candle[]; request: IndicatorRequest }): Record<string, number> {
    const values = input.candles.map(getSourceValue);
    const length = Number(input.request.params.length ?? 14);

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
      default:
        return { value: 0 };
    }
  }
}
