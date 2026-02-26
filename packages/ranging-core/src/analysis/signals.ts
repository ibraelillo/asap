import type { Candle } from "../types";

function isPivotLow(values: number[], index: number, left: number, right: number): boolean {
  const value = values[index];
  if (!Number.isFinite(value)) return false;

  for (let i = index - left; i <= index + right; i++) {
    if (i === index) continue;
    if (i < 0 || i >= values.length) return false;
    if (values[i] <= value) return false;
  }

  return true;
}

function isPivotHigh(values: number[], index: number, left: number, right: number): boolean {
  const value = values[index];
  if (!Number.isFinite(value)) return false;

  for (let i = index - left; i <= index + right; i++) {
    if (i === index) continue;
    if (i < 0 || i >= values.length) return false;
    if (values[i] >= value) return false;
  }

  return true;
}

function collectPivots(
  values: number[],
  uptoIndex: number,
  left: number,
  right: number,
  kind: "low" | "high",
): number[] {
  const pivots: number[] = [];
  const maxIndex = Math.min(uptoIndex, values.length - 1);

  for (let i = left; i <= maxIndex - right; i++) {
    const ok = kind === "low" ? isPivotLow(values, i, left, right) : isPivotHigh(values, i, left, right);
    if (ok) pivots.push(i);
  }

  return pivots;
}

export function detectBullishDivergence(
  candles: Candle[],
  waveTrend: number[],
  index: number,
  swingLookback: number,
  maxBarsAfterDivergence: number,
): boolean {
  if (index < 0 || index >= candles.length) return false;

  const lows = candles.map((c) => c.low);
  const pivots = collectPivots(lows, index, swingLookback, swingLookback, "low");
  if (pivots.length < 2) return false;

  const p2 = pivots[pivots.length - 1];
  const p1 = pivots[pivots.length - 2];

  if (index - p2 > maxBarsAfterDivergence) return false;

  const priceLowerLow = candles[p2].low < candles[p1].low;
  const oscHigherLow = (waveTrend[p2] ?? Number.NaN) > (waveTrend[p1] ?? Number.NaN);

  return priceLowerLow && oscHigherLow;
}

export function detectBearishDivergence(
  candles: Candle[],
  waveTrend: number[],
  index: number,
  swingLookback: number,
  maxBarsAfterDivergence: number,
): boolean {
  if (index < 0 || index >= candles.length) return false;

  const highs = candles.map((c) => c.high);
  const pivots = collectPivots(highs, index, swingLookback, swingLookback, "high");
  if (pivots.length < 2) return false;

  const p2 = pivots[pivots.length - 1];
  const p1 = pivots[pivots.length - 2];

  if (index - p2 > maxBarsAfterDivergence) return false;

  const priceHigherHigh = candles[p2].high > candles[p1].high;
  const oscLowerHigh = (waveTrend[p2] ?? Number.NaN) < (waveTrend[p1] ?? Number.NaN);

  return priceHigherHigh && oscLowerHigh;
}

export function detectBullishSfp(candles: Candle[], index: number, lookbackBars: number): boolean {
  if (index <= 0 || index >= candles.length) return false;

  const from = Math.max(0, index - lookbackBars);
  let previousSwingLow = Number.POSITIVE_INFINITY;

  for (let i = from; i < index; i++) {
    previousSwingLow = Math.min(previousSwingLow, candles[i].low);
  }

  if (!Number.isFinite(previousSwingLow)) return false;

  const candle = candles[index];
  return candle.low < previousSwingLow && candle.close > previousSwingLow;
}

export function detectBearishSfp(candles: Candle[], index: number, lookbackBars: number): boolean {
  if (index <= 0 || index >= candles.length) return false;

  const from = Math.max(0, index - lookbackBars);
  let previousSwingHigh = Number.NEGATIVE_INFINITY;

  for (let i = from; i < index; i++) {
    previousSwingHigh = Math.max(previousSwingHigh, candles[i].high);
  }

  if (!Number.isFinite(previousSwingHigh)) return false;

  const candle = candles[index];
  return candle.high > previousSwingHigh && candle.close < previousSwingHigh;
}
