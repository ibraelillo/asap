import type { Candle } from "@repo/trading-engine";

export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(Number.NaN);
  if (period <= 0) return out;

  let rolling = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    rolling += value;

    if (index >= period) {
      rolling -= values[index - period] ?? 0;
    }

    if (index >= period - 1) {
      out[index] = rolling / period;
    }
  }

  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(Number.NaN);
  if (period <= 0 || values.length === 0) return out;

  const alpha = 2 / (period + 1);
  let previous = values[0] ?? 0;
  out[0] = previous;

  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? previous;
    previous = alpha * value + (1 - alpha) * previous;
    out[index] = previous;
  }

  return out;
}

export function rma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(Number.NaN);
  if (period <= 0 || values.length === 0) return out;

  let rolling = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    if (index < period) {
      rolling += value;
      if (index === period - 1) {
        out[index] = rolling / period;
      }
      continue;
    }

    const previous = out[index - 1];
    if (!Number.isFinite(previous)) continue;
    out[index] = (previous * (period - 1) + value) / period;
  }

  return out;
}

export function computeRsi(closes: number[], period: number): number[] {
  const gains = new Array<number>(closes.length).fill(0);
  const losses = new Array<number>(closes.length).fill(0);

  for (let index = 1; index < closes.length; index += 1) {
    const delta = (closes[index] ?? 0) - (closes[index - 1] ?? 0);
    gains[index] = delta > 0 ? delta : 0;
    losses[index] = delta < 0 ? Math.abs(delta) : 0;
  }

  const avgGain = rma(gains, period);
  const avgLoss = rma(losses, period);

  return closes.map((_, index) => {
    const gain = avgGain[index];
    const loss = avgLoss[index];
    if (
      gain === undefined ||
      loss === undefined ||
      !Number.isFinite(gain) ||
      !Number.isFinite(loss)
    ) {
      return Number.NaN;
    }
    if (loss === 0) return 100;
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  });
}

export function computeAtr(candles: Candle[], period: number): number[] {
  const trueRanges = candles.map((candle, index) => {
    if (index === 0) {
      return candle.high - candle.low;
    }

    const previousClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  return rma(trueRanges, period);
}

export function slopePctAt(
  values: number[],
  index: number,
  lookbackBars: number,
  divisor: number,
): number {
  if (index < 0 || index >= values.length || lookbackBars <= 0) return 0;
  const from = index - lookbackBars;
  if (from < 0) return 0;

  const current = values[index];
  const previous = values[from];
  if (
    current === undefined ||
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    !Number.isFinite(divisor) ||
    divisor === 0
  ) {
    return 0;
  }

  return (current - previous) / divisor;
}
