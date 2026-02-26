import type { Candle, RangeContext, RangeReversalConfig, ValueAreaLevels } from "../types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fallbackLevels(candles: Candle[]): ValueAreaLevels {
  const latest = candles[candles.length - 1];
  const price = latest?.close ?? 0;
  return {
    val: price,
    vah: price,
    poc: price,
  };
}

export function computeVolumeProfileLevels(
  candles: Candle[],
  bins = 24,
  valueAreaPct = 0.7,
): ValueAreaLevels {
  if (candles.length === 0) return { val: 0, vah: 0, poc: 0 };
  if (candles.length === 1) {
    const c = candles[0];
    return { val: c.low, vah: c.high, poc: c.close };
  }

  const minPrice = candles.reduce((acc, c) => Math.min(acc, c.low), Number.POSITIVE_INFINITY);
  const maxPrice = candles.reduce((acc, c) => Math.max(acc, c.high), Number.NEGATIVE_INFINITY);

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || minPrice === maxPrice) {
    return fallbackLevels(candles);
  }

  const binCount = Math.max(3, Math.floor(bins));
  const binSize = (maxPrice - minPrice) / binCount;
  const volumes = new Array<number>(binCount).fill(0);

  for (const candle of candles) {
    const typical = (candle.high + candle.low + candle.close) / 3;
    const rawIdx = Math.floor((typical - minPrice) / binSize);
    const idx = clamp(rawIdx, 0, binCount - 1);
    volumes[idx] += Math.max(0, candle.volume);
  }

  let pocIdx = 0;
  for (let i = 1; i < volumes.length; i++) {
    if (volumes[i] > volumes[pocIdx]) {
      pocIdx = i;
    }
  }

  const totalVolume = volumes.reduce((acc, v) => acc + v, 0);
  const target = totalVolume * clamp(valueAreaPct, 0.1, 1);

  const selected = new Set<number>([pocIdx]);
  let cumulative = volumes[pocIdx];
  let left = pocIdx - 1;
  let right = pocIdx + 1;

  while (cumulative < target && (left >= 0 || right < binCount)) {
    const leftVolume = left >= 0 ? volumes[left] : -1;
    const rightVolume = right < binCount ? volumes[right] : -1;

    if (rightVolume > leftVolume) {
      selected.add(right);
      cumulative += rightVolume;
      right += 1;
      continue;
    }

    if (left >= 0) {
      selected.add(left);
      cumulative += leftVolume;
      left -= 1;
      continue;
    }

    selected.add(right);
    cumulative += rightVolume;
    right += 1;
  }

  const selectedBins = [...selected].sort((a, b) => a - b);
  const valIdx = selectedBins[0] ?? pocIdx;
  const vahIdx = selectedBins[selectedBins.length - 1] ?? pocIdx;

  return {
    val: minPrice + valIdx * binSize,
    vah: minPrice + (vahIdx + 1) * binSize,
    poc: minPrice + (pocIdx + 0.5) * binSize,
  };
}

export function computeOverlapRatio(a: ValueAreaLevels, b: ValueAreaLevels): number {
  const overlap = Math.max(0, Math.min(a.vah, b.vah) - Math.max(a.val, b.val));
  const union = Math.max(a.vah, b.vah) - Math.min(a.val, b.val);

  if (union <= 0) return 0;
  return overlap / union;
}

function averageLevels(a: ValueAreaLevels, b: ValueAreaLevels): ValueAreaLevels {
  return {
    val: (a.val + b.val) / 2,
    vah: (a.vah + b.vah) / 2,
    poc: (a.poc + b.poc) / 2,
  };
}

export function buildRangeContext(
  primaryCandles: Candle[],
  secondaryCandles: Candle[],
  config: RangeReversalConfig,
): RangeContext {
  const primary =
    primaryCandles.length > 0
      ? computeVolumeProfileLevels(primaryCandles, config.range.bins, config.range.valueAreaPct)
      : fallbackLevels(secondaryCandles);

  const secondary =
    secondaryCandles.length > 0
      ? computeVolumeProfileLevels(secondaryCandles, config.range.bins, config.range.valueAreaPct)
      : fallbackLevels(primaryCandles);

  const overlapRatio = computeOverlapRatio(primary, secondary);

  return {
    primary,
    secondary,
    effective: averageLevels(primary, secondary),
    overlapRatio,
    isAligned: overlapRatio >= config.range.minOverlapPct,
  };
}

export function resolveLevel(levels: ValueAreaLevels, label: "VAL" | "VAH" | "POC"): number {
  if (label === "VAL") return levels.val;
  if (label === "VAH") return levels.vah;
  return levels.poc;
}
