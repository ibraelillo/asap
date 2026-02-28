import type {
  ClosePositionIntent,
  HoldIntent,
  PositionState,
  StrategyDecision,
  TradingStrategy,
} from "@repo/trading-engine";
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
  RangeReversalDecisionDiagnostics,
  RangeReversalIntentMeta,
  RangeReversalSnapshot,
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

interface EvaluatedEntry {
  decision: EntryDecision;
  diagnostics: RangeReversalDecisionDiagnostics;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

  const excursionWindow = Math.max(1, config.signal.priceExcursionLookbackBars);
  const excursionSlice = executionSlice.slice(-excursionWindow);

  const recentLowBrokeVal =
    candle.features?.recentLowBrokeVal ??
    excursionSlice.some((c) => c.low < range.effective.val);

  const recentHighBrokeVah =
    candle.features?.recentHighBrokeVah ??
    excursionSlice.some((c) => c.high > range.effective.vah);

  return {
    time: candle.time,
    price: candle.close,
    range,
    bullishDivergence,
    bearishDivergence,
    moneyFlowSlope,
    bullishSfp,
    bearishSfp,
    recentLowBrokeVal,
    recentHighBrokeVah,
  };
}

function evaluateEntryState(
  snapshot: SignalSnapshot,
  config: RangeReversalConfig,
): EvaluatedEntry {
  const failedLong: string[] = [];
  const failedShort: string[] = [];
  const rangeWidth = Math.max(snapshot.range.effective.vah - snapshot.range.effective.val, Number.EPSILON);
  const reentryDistancePct = clamp(config.signal.armedReentryMaxDistancePct, 0, 1);

  if (!snapshot.range.isAligned) {
    failedLong.push("range_not_aligned");
    failedShort.push("range_not_aligned");
  }

  if (!(snapshot.price < snapshot.range.effective.val)) {
    if (!config.signal.allowArmedReentry) {
      failedLong.push("price_not_below_val");
    } else if (!snapshot.recentLowBrokeVal) {
      failedLong.push("price_not_below_val");
      failedLong.push("missing_recent_val_sweep");
    } else {
      const maxLongReentry = snapshot.range.effective.val + rangeWidth * reentryDistancePct;
      if (snapshot.price > maxLongReentry) {
        failedLong.push("price_not_below_val");
        failedLong.push("long_reentry_too_far_from_val");
      }
    }
  }

  if (!(snapshot.price > snapshot.range.effective.vah)) {
    if (!config.signal.allowArmedReentry) {
      failedShort.push("price_not_above_vah");
    } else if (!snapshot.recentHighBrokeVah) {
      failedShort.push("price_not_above_vah");
      failedShort.push("missing_recent_vah_sweep");
    } else {
      const minShortReentry = snapshot.range.effective.vah - rangeWidth * reentryDistancePct;
      if (snapshot.price < minShortReentry) {
        failedShort.push("price_not_above_vah");
        failedShort.push("short_reentry_too_far_from_vah");
      }
    }
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
      decision: {
        signal: null,
        reasons: ["conflicting_long_and_short_signal"],
      },
      diagnostics: {
        signal: null,
        failedLongReasons: failedLong,
        failedShortReasons: failedShort,
      },
    };
  }

  if (longReady) {
    return {
      decision: {
        signal: "long",
        reasons: ["long_signal_confirmed"],
      },
      diagnostics: {
        signal: "long",
        failedLongReasons: [],
        failedShortReasons: failedShort,
      },
    };
  }

  if (shortReady) {
    return {
      decision: {
        signal: "short",
        reasons: ["short_signal_confirmed"],
      },
      diagnostics: {
        signal: "short",
        failedLongReasons: failedLong,
        failedShortReasons: [],
      },
    };
  }

  return {
    decision: {
      signal: null,
      reasons: [...new Set([...failedLong, ...failedShort])],
    },
    diagnostics: {
      signal: null,
      failedLongReasons: failedLong,
      failedShortReasons: failedShort,
    },
  };
}

export function evaluateEntry(snapshot: SignalSnapshot, config: RangeReversalConfig): EntryDecision {
  return evaluateEntryState(snapshot, config).decision;
}

export function buildRangeReversalDecision(input: {
  botId: string;
  strategyId?: string;
  snapshot: RangeReversalSnapshot;
  config: RangeReversalConfig;
  executionCandle: Candle;
  position: PositionState | null;
}): StrategyDecision<RangeReversalIntentMeta> {
  const strategyId = input.strategyId ?? "range-reversal";
  const { decision, diagnostics } = evaluateEntryState(input.snapshot, input.config);

  if (decision.signal) {
    const currentPosition = input.position;
    const oppositePositionOpen =
      currentPosition &&
      currentPosition.remainingQuantity > 0 &&
      currentPosition.side !== decision.signal;

    if (oppositePositionOpen && input.config.exits.runnerExitOnOppositeSignal) {
      const closeIntent: ClosePositionIntent<RangeReversalIntentMeta> = {
        kind: "close",
        botId: input.botId,
        strategyId,
        time: input.snapshot.time,
        reasons: ["opposite_signal_confirmed"],
        side: currentPosition.side,
        price: input.executionCandle.close,
        meta: {
          range: input.snapshot.range.effective,
          stopPrice: currentPosition.stopPrice ?? input.executionCandle.close,
          tp1Price: input.executionCandle.close,
          tp2Price: input.executionCandle.close,
          diagnostics,
        },
      };

      return {
        snapshotTime: input.snapshot.time,
        confidence: 1,
        reasons: decision.reasons,
        intents: [closeIntent],
        diagnostics: {
          signal: decision.signal,
          failedLongReasons: diagnostics.failedLongReasons,
          failedShortReasons: diagnostics.failedShortReasons,
        },
      };
    }
  }

  if (input.position && input.position.remainingQuantity > 0) {
    const holdIntent: HoldIntent<RangeReversalIntentMeta> = {
      kind: "hold",
      botId: input.botId,
      strategyId,
      time: input.snapshot.time,
      reasons: decision.reasons.length > 0 ? decision.reasons : ["position_open_hold"],
      meta: {
        range: input.snapshot.range.effective,
        stopPrice: input.position.stopPrice ?? input.executionCandle.close,
        tp1Price: input.executionCandle.close,
        tp2Price: input.executionCandle.close,
        diagnostics,
      },
    };

    return {
      snapshotTime: input.snapshot.time,
      confidence: decision.signal ? 1 : 0,
      reasons: decision.reasons,
      intents: [holdIntent],
      diagnostics: {
        signal: decision.signal,
        failedLongReasons: diagnostics.failedLongReasons,
        failedShortReasons: diagnostics.failedShortReasons,
      },
    };
  }

  if (!decision.signal) {
    const holdIntent: HoldIntent<RangeReversalIntentMeta> = {
      kind: "hold",
      botId: input.botId,
      strategyId,
      time: input.snapshot.time,
      reasons: decision.reasons.length > 0 ? decision.reasons : ["no_confluence"],
    };

    return {
      snapshotTime: input.snapshot.time,
      confidence: 0,
      reasons: decision.reasons,
      intents: [holdIntent],
      diagnostics: {
        signal: null,
        failedLongReasons: diagnostics.failedLongReasons,
        failedShortReasons: diagnostics.failedShortReasons,
      },
    };
  }

  const stopPrice =
    decision.signal === "long"
      ? input.executionCandle.low * (1 - input.config.risk.slBufferPct)
      : input.executionCandle.high * (1 + input.config.risk.slBufferPct);
  const levels = resolveTakeProfitLevels(
    input.snapshot.range.effective,
    decision.signal,
    input.config,
  );

  return {
    snapshotTime: input.snapshot.time,
    confidence: 1,
    reasons: decision.reasons,
    intents: [
      {
        kind: "enter",
        botId: input.botId,
        strategyId,
        time: input.snapshot.time,
        reasons: decision.reasons,
        side: decision.signal,
        entry: {
          type: "market",
          price: input.executionCandle.close,
        },
        risk: {
          stopPrice,
        },
        management: {
          takeProfits: [
            {
              id: "tp1",
              label: "TP1",
              price: levels.tp1,
              sizeFraction: input.config.exits.tp1SizePct,
              moveStopToBreakeven: input.config.exits.moveStopToBreakevenOnTp1,
            },
            {
              id: "tp2",
              label: "TP2",
              price: levels.tp2,
              sizeFraction: input.config.exits.tp2SizePct,
            },
          ],
          closeOnOppositeIntent: input.config.exits.runnerExitOnOppositeSignal,
          cooldownBars: input.config.exits.cooldownBars,
        },
        meta: {
          range: input.snapshot.range.effective,
          stopPrice,
          tp1Price: levels.tp1,
          tp2Price: levels.tp2,
          diagnostics,
        },
      },
    ],
    diagnostics: {
      signal: decision.signal,
      failedLongReasons: diagnostics.failedLongReasons,
      failedShortReasons: diagnostics.failedShortReasons,
    },
  };
}

export function resolveTakeProfitLevels(
  range: ValueAreaLevels,
  side: Side,
  config: RangeReversalConfig,
): { tp1: number; tp2: number } {
  const tp1Raw = resolveLevel(range, config.exits.tp1Level);
  const tp2Raw =
    side === "long"
      ? resolveLevel(range, config.exits.tp2LongLevel)
      : resolveLevel(range, config.exits.tp2ShortLevel);

  if (side === "long") {
    return tp2Raw >= tp1Raw
      ? { tp1: tp1Raw, tp2: tp2Raw }
      : { tp1: tp2Raw, tp2: tp1Raw };
  }

  return tp2Raw <= tp1Raw
    ? { tp1: tp1Raw, tp2: tp2Raw }
    : { tp1: tp2Raw, tp2: tp1Raw };
}

export function createRangeReversalStrategy(
  config: RangeReversalConfig,
): TradingStrategy<RangeReversalConfig, RangeReversalSnapshot, RangeReversalIntentMeta> {
  return {
    id: "range-reversal",
    version: "1",
    buildSnapshot: ({ market }) => {
      const executionCandles = market.executionCandles as BacktestCandle[];
      return buildSignalSnapshot({
        executionCandles,
        index: market.index,
        primaryRangeCandles: market.series.primaryRange,
        secondaryRangeCandles: market.series.secondaryRange,
        config,
      });
    },
    evaluate: ({ bot, market, position, snapshot }) => {
      const executionCandle = market.executionCandles[market.index];
      if (!executionCandle) {
        throw new Error(`Execution candle index out of range: ${market.index}`);
      }

      return buildRangeReversalDecision({
        botId: bot.id,
        strategyId: "range-reversal",
        snapshot,
        config,
        executionCandle,
        position,
      });
    },
  };
}
