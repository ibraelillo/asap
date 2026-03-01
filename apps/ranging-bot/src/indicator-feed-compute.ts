import type { Candle, IndicatorFeedRequirement } from "@repo/trading-engine";

function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(Number.NaN);
  if (period <= 0) return out;

  let rolling = 0;
  for (let index = 0; index < values.length; index += 1) {
    rolling += values[index] ?? 0;
    if (index >= period) {
      rolling -= values[index - period] ?? 0;
    }
    if (index >= period - 1) {
      out[index] = rolling / period;
    }
  }

  return out;
}

function ema(values: number[], period: number): number[] {
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

function rma(values: number[], period: number): number[] {
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

function computeRsi(closes: number[], period: number): number[] {
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

function computeAtr(candles: Candle[], period: number): number[] {
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

function computeWaveTrend(
  candles: Candle[],
  channelLength: number,
  averageLength: number,
  signalLength: number,
): { wt1: number[]; wt2: number[] } {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const esa = ema(tp, channelLength);
  const deviation = ema(
    tp.map((value, index) => {
      const esaValue = esa[index];
      return Math.abs(
        value -
          (typeof esaValue === "number" && Number.isFinite(esaValue)
            ? esaValue
            : value),
      );
    }),
    channelLength,
  );

  const ci = tp.map((value, index) => {
    const d = deviation[index];
    const esaValue = esa[index];
    if (typeof d !== "number" || !Number.isFinite(d) || d === 0) return 0;
    return (
      (value -
        (typeof esaValue === "number" && Number.isFinite(esaValue)
          ? esaValue
          : value)) /
      (0.015 * d)
    );
  });

  const wt1 = ema(ci, averageLength);
  const wt2 = sma(
    wt1.map((value) => (Number.isFinite(value) ? value : 0)),
    signalLength,
  );

  return { wt1, wt2 };
}

function computeMoneyFlow(candles: Candle[], period: number): number[] {
  const mfm = candles.map((candle) => {
    const range = candle.high - candle.low;
    if (range === 0) return 0;
    return (candle.close - candle.low - (candle.high - candle.close)) / range;
  });

  const mfv = candles.map((candle, index) => (mfm[index] ?? 0) * candle.volume);
  const out = new Array(candles.length).fill(Number.NaN);

  let sumFlow = 0;
  let sumVolume = 0;

  for (let index = 0; index < candles.length; index += 1) {
    const flowValue = mfv[index];
    const candle = candles[index];
    if (flowValue === undefined || !candle) continue;

    sumFlow += flowValue;
    sumVolume += candle.volume;

    if (index >= period) {
      const outgoingFlow = mfv[index - period];
      const outgoingCandle = candles[index - period];
      if (outgoingFlow !== undefined && outgoingCandle) {
        sumFlow -= outgoingFlow;
        sumVolume -= outgoingCandle.volume;
      }
    }

    if (index >= period - 1) {
      out[index] = sumVolume === 0 ? 0 : sumFlow / sumVolume;
    }
  }

  return out;
}

function selectSeries(
  candles: Candle[],
  requirement: IndicatorFeedRequirement,
): number[] {
  const seriesName =
    typeof requirement.params.series === "string"
      ? requirement.params.series
      : (requirement.source ?? "close");

  switch (seriesName) {
    case "open":
      return candles.map((candle) => candle.open);
    case "high":
      return candles.map((candle) => candle.high);
    case "low":
      return candles.map((candle) => candle.low);
    case "hl2":
      return candles.map((candle) => (candle.high + candle.low) / 2);
    case "hlc3":
      return candles.map(
        (candle) => (candle.high + candle.low + candle.close) / 3,
      );
    case "ohlc4":
      return candles.map(
        (candle) => (candle.open + candle.high + candle.low + candle.close) / 4,
      );
    case "volume":
      return candles.map((candle) => candle.volume);
    case "close":
    default:
      return candles.map((candle) => candle.close);
  }
}

function readLength(
  params: Record<string, unknown>,
  key = "length",
  fallback = 14,
): number {
  const value = Number(params[key]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function computeIndicatorFeed(
  candles: Candle[],
  requirement: IndicatorFeedRequirement,
): Record<string, number[]> {
  switch (requirement.indicatorId) {
    case "ema":
      return {
        value: ema(
          candles.map((candle) => candle.close),
          readLength(requirement.params),
        ),
      };
    case "sma":
      return {
        value: sma(
          selectSeries(candles, requirement),
          readLength(requirement.params),
        ),
      };
    case "rsi":
      return {
        value: computeRsi(
          selectSeries(candles, requirement),
          readLength(requirement.params),
        ),
      };
    case "atr":
      return {
        value: computeAtr(candles, readLength(requirement.params)),
      };
    case "moneyflow":
      return {
        value: computeMoneyFlow(
          candles,
          readLength(requirement.params, "period"),
        ),
      };
    case "wavetrend": {
      const channelLength = readLength(requirement.params, "channelLength", 10);
      const averageLength = readLength(requirement.params, "averageLength", 21);
      const signalLength = readLength(requirement.params, "signalLength", 4);
      return computeWaveTrend(
        candles,
        channelLength,
        averageLength,
        signalLength,
      );
    }
    default:
      throw new Error(`Unsupported indicator feed ${requirement.indicatorId}`);
  }
}
