import { computeMoneyFlow, computeWaveTrend, slopeAt } from "./analysis/indicators";
import { buildRangeContext, resolveLevel } from "./analysis/range";
import {
  detectBearishDivergence,
  detectBearishSfp,
  detectBullishDivergence,
  detectBullishSfp,
} from "./analysis/signals";
import type {
  BacktestCandle,
  Candle,
  EntryDecision,
  RangeContext,
  RangeReversalConfig,
  Side,
  SignalSnapshot,
  ValueAreaLevels,
} from "./types";

export interface SignalSnapshotInput {
  executionCandles: BacktestCandle[];
  index: number;
  primaryRangeCandles?: Candle[];
  secondaryRangeCandles?: Candle[];
  config: RangeReversalConfig;
}

function sliceUpToTime(candles: Candle[], time: number, lookbackBars: number): Candle[] {
  const eligible = candles.filter((c) => c.time <= time);
  return eligible.slice(-lookbackBars);
}

function applyRangeOverrides(range: RangeContext, candle: BacktestCandle): RangeContext {
  const features = candle.features;
  if (!features) return range;

  const hasAnyLevel =
    features.val !== undefined || features.vah !== undefined || features.poc !== undefined;

  if (!hasAnyLevel && features.rangeValid === undefined) {
    return range;
  }

  const effective: ValueAreaLevels = {
    val: features.val ?? range.effective.val,
    vah: features.vah ?? range.effective.vah,
    poc: features.poc ?? range.effective.poc,
  };

  return {
    ...range,
    effective,
    primary: effective,
    secondary: effective,
    isAligned: features.rangeValid ?? range.isAligned,
  };
}

export function buildSignalSnapshot(input: SignalSnapshotInput): SignalSnapshot {
  const { executionCandles, index, config } = input;
  const candle = executionCandles[index];
  if (!candle) {
    throw new Error(`Execution candle index out of range: ${index}`);
  }

  const executionSlice = executionCandles.slice(0, index + 1);

  const primarySource = input.primaryRangeCandles?.length
    ? input.primaryRangeCandles
    : executionCandles;
  const secondarySource = input.secondaryRangeCandles?.length
    ? input.secondaryRangeCandles
    : executionCandles;

  let range = buildRangeContext(
    sliceUpToTime(primarySource, candle.time, config.range.primaryLookbackBars),
    sliceUpToTime(secondarySource, candle.time, config.range.secondaryLookbackBars),
    config,
  );
  range = applyRangeOverrides(range, candle);

  const wt = computeWaveTrend(
    executionSlice,
    config.signal.waveTrendChannelLength,
    config.signal.waveTrendAverageLength,
    config.signal.waveTrendSignalLength,
  );
  const moneyFlow = computeMoneyFlow(executionSlice, config.signal.moneyFlowPeriod);

  const moneyFlowSlope =
    candle.features?.moneyFlowSlope ??
    slopeAt(moneyFlow, executionSlice.length - 1, config.signal.moneyFlowSlopeBars);

  const bullishDivergence =
    candle.features?.bullishDivergence ??
    detectBullishDivergence(
      executionSlice,
      wt.wt1,
      executionSlice.length - 1,
      config.signal.swingLookback,
      config.signal.maxBarsAfterDivergence,
    );

  const bearishDivergence =
    candle.features?.bearishDivergence ??
    detectBearishDivergence(
      executionSlice,
      wt.wt1,
      executionSlice.length - 1,
      config.signal.swingLookback,
      config.signal.maxBarsAfterDivergence,
    );

  const bullishSfp =
    candle.features?.bullishSfp ??
    detectBullishSfp(executionSlice, executionSlice.length - 1, config.signal.swingLookback * 3);

  const bearishSfp =
    candle.features?.bearishSfp ??
    detectBearishSfp(executionSlice, executionSlice.length - 1, config.signal.swingLookback * 3);

  return {
    time: candle.time,
    price: candle.close,
    range,
    bullishDivergence,
    bearishDivergence,
    moneyFlowSlope,
    bullishSfp,
    bearishSfp,
  };
}

export function evaluateEntry(snapshot: SignalSnapshot, config: RangeReversalConfig): EntryDecision {
  const failedLong: string[] = [];
  const failedShort: string[] = [];

  if (!snapshot.range.isAligned) {
    failedLong.push("range_not_aligned");
    failedShort.push("range_not_aligned");
  }

  if (!(snapshot.price < snapshot.range.effective.val)) {
    failedLong.push("price_not_below_val");
  }

  if (!(snapshot.price > snapshot.range.effective.vah)) {
    failedShort.push("price_not_above_vah");
  }

  if (config.signal.requireDivergence) {
    if (!snapshot.bullishDivergence) failedLong.push("missing_bullish_divergence");
    if (!snapshot.bearishDivergence) failedShort.push("missing_bearish_divergence");
  }

  if (!(snapshot.moneyFlowSlope > 0)) failedLong.push("money_flow_not_rising");
  if (!(snapshot.moneyFlowSlope < 0)) failedShort.push("money_flow_not_falling");

  if (config.signal.requireSfp) {
    if (!snapshot.bullishSfp) failedLong.push("missing_bullish_sfp");
    if (!snapshot.bearishSfp) failedShort.push("missing_bearish_sfp");
  }

  const longReady = failedLong.length === 0;
  const shortReady = failedShort.length === 0;

  if (longReady && shortReady) {
    return {
      signal: null,
      reasons: ["conflicting_long_and_short_signal"],
    };
  }

  if (longReady) {
    return {
      signal: "long",
      reasons: ["long_signal_confirmed"],
    };
  }

  if (shortReady) {
    return {
      signal: "short",
      reasons: ["short_signal_confirmed"],
    };
  }

  return {
    signal: null,
    reasons: [...new Set([...failedLong, ...failedShort])],
  };
}

export function resolveTakeProfitLevels(
  range: ValueAreaLevels,
  side: Side,
  config: RangeReversalConfig,
): { tp1: number; tp2: number } {
  const tp1 = resolveLevel(range, config.exits.tp1Level);
  const tp2 =
    side === "long"
      ? resolveLevel(range, config.exits.tp2LongLevel)
      : resolveLevel(range, config.exits.tp2ShortLevel);

  return { tp1, tp2 };
}
