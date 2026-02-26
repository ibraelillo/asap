import type { Candle } from "../types";

export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(Number.NaN);
  if (period <= 0) return out;

  let rolling = 0;
  for (let i = 0; i < values.length; i++) {
    rolling += values[i] ?? 0;
    if (i >= period) {
      rolling -= values[i - period] ?? 0;
    }
    if (i >= period - 1) {
      out[i] = rolling / period;
    }
  }

  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(Number.NaN);
  if (period <= 0 || values.length === 0) return out;

  const alpha = 2 / (period + 1);
  let prev = values[0] ?? 0;
  out[0] = prev;

  for (let i = 1; i < values.length; i++) {
    const value = values[i] ?? prev;
    prev = alpha * value + (1 - alpha) * prev;
    out[i] = prev;
  }

  return out;
}

export function computeWaveTrend(
  candles: Candle[],
  channelLength: number,
  averageLength: number,
  signalLength: number,
): { wt1: number[]; wt2: number[] } {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const esa = ema(tp, channelLength);
  const deviation = ema(
    tp.map((v, i) => Math.abs(v - (esa[i] ?? v))),
    channelLength,
  );

  const ci = tp.map((v, i) => {
    const d = deviation[i];
    if (!Number.isFinite(d) || d === 0) return 0;
    return (v - (esa[i] ?? v)) / (0.015 * d);
  });

  const wt1 = ema(ci, averageLength);
  const wt2 = sma(wt1.map((v) => (Number.isFinite(v) ? v : 0)), signalLength);

  return { wt1, wt2 };
}

export function computeMoneyFlow(candles: Candle[], period: number): number[] {
  const mfm = candles.map((c) => {
    const range = c.high - c.low;
    if (range === 0) return 0;
    return ((c.close - c.low) - (c.high - c.close)) / range;
  });

  const mfv = candles.map((c, i) => mfm[i] * c.volume);
  const out = new Array(candles.length).fill(Number.NaN);

  let sumFlow = 0;
  let sumVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    sumFlow += mfv[i];
    sumVolume += candles[i].volume;

    if (i >= period) {
      sumFlow -= mfv[i - period];
      sumVolume -= candles[i - period].volume;
    }

    if (i >= period - 1) {
      out[i] = sumVolume === 0 ? 0 : sumFlow / sumVolume;
    }
  }

  return out;
}

export function slopeAt(values: number[], index: number, lookbackBars: number): number {
  if (index < 0 || index >= values.length || lookbackBars <= 0) return 0;

  const from = index - lookbackBars;
  if (from < 0) return 0;

  const current = values[index];
  const previous = values[from];

  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return 0;
  }

  return current - previous;
}
