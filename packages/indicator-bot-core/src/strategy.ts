import type {
  Candle,
  ClosePositionIntent,
  EnterPositionIntent,
  HoldIntent,
  Side,
  StrategyEvaluationInput,
  StrategySnapshotInput,
  StrategyDecision,
  TradingStrategy,
} from "@repo/trading-engine";
import { computeAtr, computeRsi, ema, slopePctAt, sma } from "./indicators";
import type {
  IndicatorBotConfig,
  IndicatorBotIntentMeta,
  IndicatorBotSignalPlan,
  IndicatorBotSnapshot,
} from "./types";

function latestSeriesValuesAt(
  candles: Candle[],
  time: number,
): { index: number; candles: Candle[] } | null {
  const filtered = candles.filter((candle) => candle.time <= time);
  if (filtered.length === 0) return null;
  return {
    index: filtered.length - 1,
    candles: filtered,
  };
}

function classifyHigherTimeframeTrend(
  candles: Candle[],
  emaLength: number,
  slopeLookbackBars: number,
): Side | "neutral" {
  const closes = candles.map((candle) => candle.close);
  const emaValues = ema(closes, emaLength);
  const index = candles.length - 1;
  const price = closes[index];
  const emaValue = emaValues[index];
  if (
    price === undefined ||
    emaValue === undefined ||
    !Number.isFinite(price) ||
    !Number.isFinite(emaValue)
  ) {
    return "neutral";
  }

  const slopePct = slopePctAt(emaValues, index, slopeLookbackBars, price);
  if (price > emaValue && slopePct > 0) return "long";
  if (price < emaValue && slopePct < 0) return "short";
  return "neutral";
}

function computeSignalPlan(input: {
  side: Side;
  snapshot: Omit<IndicatorBotSnapshot, "long" | "short">;
  config: IndicatorBotConfig;
}): IndicatorBotSignalPlan {
  const { side, snapshot, config } = input;
  const checks = {
    trend:
      side === "long"
        ? snapshot.fastEma > snapshot.slowEma &&
          snapshot.fastSlopePct > 0 &&
          snapshot.emaSpreadPct >= config.trend.minEmaSeparationPct
        : snapshot.fastEma < snapshot.slowEma &&
          snapshot.fastSlopePct < 0 &&
          snapshot.emaSpreadPct >= config.trend.minEmaSeparationPct,
    pullback:
      side === "long"
        ? snapshot.price >= snapshot.fastEma &&
          (snapshot.price - snapshot.fastEma) / snapshot.price <=
            config.trend.maxPriceDistanceFromFastEmaPct
        : snapshot.price <= snapshot.fastEma &&
          (snapshot.fastEma - snapshot.price) / snapshot.price <=
            config.trend.maxPriceDistanceFromFastEmaPct,
    momentum:
      side === "long"
        ? snapshot.rsi >= config.momentum.longThreshold &&
          snapshot.rsi <= config.momentum.longCeiling
        : snapshot.rsi <= config.momentum.shortThreshold &&
          snapshot.rsi >= config.momentum.shortFloor,
    volume: config.volume.requireExpansion
      ? snapshot.volumeRatio >= config.volume.minVolumeRatio
      : true,
    primaryTrend: config.execution.requirePrimaryTrendConfirmation
      ? snapshot.primaryTrend === side
      : true,
    secondaryTrend: config.execution.requireSecondaryTrendConfirmation
      ? snapshot.secondaryTrend === side
      : true,
  };

  const blockers = [
    !checks.trend ? `${side}_trend_not_aligned` : null,
    !checks.pullback ? `${side}_pullback_not_ready` : null,
    !checks.momentum ? `${side}_momentum_not_ready` : null,
    !checks.volume ? `${side}_volume_not_confirmed` : null,
    !checks.primaryTrend ? `${side}_primary_trend_not_confirmed` : null,
    !checks.secondaryTrend ? `${side}_secondary_trend_not_confirmed` : null,
  ].filter((reason): reason is string => reason !== null);

  const reasons = [
    checks.trend ? `${side}_trend_aligned` : null,
    checks.pullback ? `${side}_pullback_ready` : null,
    checks.momentum ? `${side}_momentum_confirmed` : null,
    checks.volume ? `${side}_volume_confirmed` : null,
    checks.primaryTrend ? `${side}_primary_trend_confirmed` : null,
    checks.secondaryTrend ? `${side}_secondary_trend_confirmed` : null,
  ].filter((reason): reason is string => reason !== null);

  return {
    ready: blockers.length === 0,
    reasons,
    blockers,
    checks,
  };
}

function buildIntentMeta(
  snapshot: Omit<IndicatorBotSnapshot, "long" | "short">,
  initialStopPrice: number,
): IndicatorBotIntentMeta {
  return {
    setup: "trend-pullback",
    initialStopPrice,
    atr: snapshot.atr,
    rsi: snapshot.rsi,
    volumeRatio: snapshot.volumeRatio,
    primaryTrend: snapshot.primaryTrend,
    secondaryTrend: snapshot.secondaryTrend,
    emaSpreadPct: snapshot.emaSpreadPct,
  };
}

function buildEnterIntent(input: {
  botId: string;
  side: Side;
  strategyId: string;
  snapshot: IndicatorBotSnapshot;
  config: IndicatorBotConfig;
}): EnterPositionIntent<IndicatorBotIntentMeta> {
  const { botId, side, strategyId, snapshot, config } = input;
  const riskDistance = snapshot.atr * config.volatility.stopAtrMultiple;
  const initialStopPrice =
    side === "long"
      ? snapshot.price - riskDistance
      : snapshot.price + riskDistance;
  const tp1Price =
    side === "long"
      ? snapshot.price + riskDistance * config.risk.tp1RewardMultiple
      : snapshot.price - riskDistance * config.risk.tp1RewardMultiple;
  const tp2Price =
    side === "long"
      ? snapshot.price + riskDistance * config.risk.tp2RewardMultiple
      : snapshot.price - riskDistance * config.risk.tp2RewardMultiple;

  return {
    kind: "enter",
    botId,
    strategyId,
    time: snapshot.time,
    reasons: side === "long" ? snapshot.long.reasons : snapshot.short.reasons,
    confidence:
      (side === "long"
        ? snapshot.long.reasons.length
        : snapshot.short.reasons.length) / 6,
    side,
    entry: {
      type: "market",
    },
    risk: {
      stopPrice: initialStopPrice,
    },
    management: {
      takeProfits: [
        {
          id: "tp1",
          label: "TP1",
          price: tp1Price,
          sizeFraction: config.risk.tp1SizePct,
          moveStopToBreakeven: config.risk.moveStopToBreakevenOnTp1,
        },
        {
          id: "tp2",
          label: "TP2",
          price: tp2Price,
          sizeFraction: config.risk.tp2SizePct,
        },
      ],
      closeOnOppositeIntent: config.execution.closeOnOppositeSignal,
      cooldownBars: config.risk.cooldownBars,
    },
    meta: buildIntentMeta(snapshot, initialStopPrice),
  };
}

function buildCloseIntent(input: {
  botId: string;
  positionSide: Side;
  strategyId: string;
  snapshot: IndicatorBotSnapshot;
  reasons: string[];
}): ClosePositionIntent<IndicatorBotIntentMeta> {
  return {
    kind: "close",
    botId: input.botId,
    strategyId: input.strategyId,
    time: input.snapshot.time,
    side: input.positionSide,
    reasons: input.reasons,
    price: input.snapshot.price,
    meta: buildIntentMeta(
      input.snapshot,
      input.positionSide === "long"
        ? input.snapshot.price - input.snapshot.atr
        : input.snapshot.price + input.snapshot.atr,
    ),
  };
}

function buildHoldIntent(
  botId: string,
  time: number,
  reasons: string[],
): HoldIntent<IndicatorBotIntentMeta> {
  return {
    kind: "hold",
    botId,
    strategyId: "indicator-bot",
    time,
    reasons,
  };
}

function toDiagnostics(
  snapshot: IndicatorBotSnapshot,
): Record<string, unknown> {
  return snapshot as unknown as Record<string, unknown>;
}

export function buildIndicatorBotSnapshot({
  market,
  config,
}: StrategySnapshotInput<IndicatorBotConfig>): IndicatorBotSnapshot {
  const executionCandles = market.executionCandles.slice(0, market.index + 1);
  const current = executionCandles[executionCandles.length - 1];
  if (!current) {
    return {
      time: 0,
      price: 0,
      fastEma: 0,
      slowEma: 0,
      fastSlopePct: 0,
      emaSpreadPct: 0,
      rsi: 0,
      atr: 0,
      volumeRatio: 0,
      primaryTrend: "neutral",
      secondaryTrend: "neutral",
      long: {
        ready: false,
        reasons: [],
        blockers: ["missing_execution_candle"],
        checks: {
          trend: false,
          pullback: false,
          momentum: false,
          volume: false,
          primaryTrend: false,
          secondaryTrend: false,
        },
      },
      short: {
        ready: false,
        reasons: [],
        blockers: ["missing_execution_candle"],
        checks: {
          trend: false,
          pullback: false,
          momentum: false,
          volume: false,
          primaryTrend: false,
          secondaryTrend: false,
        },
      },
    };
  }

  const closes = executionCandles.map((candle) => candle.close);
  const volumes = executionCandles.map((candle) => candle.volume);
  const fastEmaSeries = ema(closes, config.trend.fastEmaLength);
  const slowEmaSeries = ema(closes, config.trend.slowEmaLength);
  const rsiSeries = computeRsi(closes, config.momentum.rsiLength);
  const atrSeries = computeAtr(executionCandles, config.volatility.atrLength);
  const volumeSmaSeries = sma(volumes, config.volume.volumeSmaLength);
  const index = executionCandles.length - 1;

  const fastEma = fastEmaSeries[index] ?? current.close;
  const slowEma = slowEmaSeries[index] ?? current.close;
  const rsi = rsiSeries[index] ?? 50;
  const atr = atrSeries[index] ?? 0;
  const volumeSma = volumeSmaSeries[index] ?? current.volume;
  const volumeRatio = volumeSma > 0 ? current.volume / volumeSma : 1;
  const fastSlopePct = slopePctAt(
    fastEmaSeries,
    index,
    config.trend.slopeLookbackBars,
    current.close,
  );
  const emaSpreadPct =
    current.close > 0 ? Math.abs(fastEma - slowEma) / current.close : 0;

  const primarySeries = latestSeriesValuesAt(
    market.series.primaryRange ?? [],
    current.time,
  );
  const secondarySeries = latestSeriesValuesAt(
    market.series.secondaryRange ?? [],
    current.time,
  );

  const baseSnapshot = {
    time: current.time,
    price: current.close,
    fastEma,
    slowEma,
    fastSlopePct,
    emaSpreadPct,
    rsi,
    atr,
    volumeRatio,
    primaryTrend: primarySeries
      ? classifyHigherTimeframeTrend(
          primarySeries.candles,
          config.trend.higherTimeframeEmaLength,
          config.trend.slopeLookbackBars,
        )
      : ("neutral" as const),
    secondaryTrend: secondarySeries
      ? classifyHigherTimeframeTrend(
          secondarySeries.candles,
          config.trend.higherTimeframeEmaLength,
          config.trend.slopeLookbackBars,
        )
      : ("neutral" as const),
  };

  return {
    ...baseSnapshot,
    long: computeSignalPlan({
      side: "long",
      snapshot: baseSnapshot,
      config,
    }),
    short: computeSignalPlan({
      side: "short",
      snapshot: baseSnapshot,
      config,
    }),
  };
}

export function createIndicatorBotStrategy(
  config: IndicatorBotConfig,
): TradingStrategy<
  IndicatorBotConfig,
  IndicatorBotSnapshot,
  IndicatorBotIntentMeta
> {
  return {
    id: "indicator-bot",
    version: "1",
    buildSnapshot: (input) => buildIndicatorBotSnapshot(input),
    evaluate: ({
      bot,
      snapshot,
      position,
    }: StrategyEvaluationInput<IndicatorBotConfig, IndicatorBotSnapshot>) => {
      if (position) {
        if (
          position.side === "long" &&
          snapshot.short.ready &&
          config.execution.closeOnOppositeSignal
        ) {
          const reasons = ["opposite_short_signal", ...snapshot.short.reasons];
          return {
            snapshotTime: snapshot.time,
            reasons,
            intents: [
              buildCloseIntent({
                botId: bot.id,
                positionSide: "long",
                strategyId: "indicator-bot",
                snapshot,
                reasons,
              }),
            ],
            diagnostics: toDiagnostics(snapshot),
          } satisfies StrategyDecision<IndicatorBotIntentMeta>;
        }

        if (
          position.side === "short" &&
          snapshot.long.ready &&
          config.execution.closeOnOppositeSignal
        ) {
          const reasons = ["opposite_long_signal", ...snapshot.long.reasons];
          return {
            snapshotTime: snapshot.time,
            reasons,
            intents: [
              buildCloseIntent({
                botId: bot.id,
                positionSide: "short",
                strategyId: "indicator-bot",
                snapshot,
                reasons,
              }),
            ],
            diagnostics: toDiagnostics(snapshot),
          } satisfies StrategyDecision<IndicatorBotIntentMeta>;
        }

        return {
          snapshotTime: snapshot.time,
          reasons: ["position_open"],
          intents: [buildHoldIntent(bot.id, snapshot.time, ["position_open"])],
          diagnostics: toDiagnostics(snapshot),
        } satisfies StrategyDecision<IndicatorBotIntentMeta>;
      }

      if (snapshot.long.ready) {
        return {
          snapshotTime: snapshot.time,
          reasons: snapshot.long.reasons,
          confidence: snapshot.long.reasons.length / 6,
          intents: [
            buildEnterIntent({
              botId: bot.id,
              side: "long",
              strategyId: "indicator-bot",
              snapshot,
              config,
            }),
          ],
          diagnostics: toDiagnostics(snapshot),
        } satisfies StrategyDecision<IndicatorBotIntentMeta>;
      }

      if (snapshot.short.ready) {
        return {
          snapshotTime: snapshot.time,
          reasons: snapshot.short.reasons,
          confidence: snapshot.short.reasons.length / 6,
          intents: [
            buildEnterIntent({
              botId: bot.id,
              side: "short",
              strategyId: "indicator-bot",
              snapshot,
              config,
            }),
          ],
          diagnostics: toDiagnostics(snapshot),
        } satisfies StrategyDecision<IndicatorBotIntentMeta>;
      }

      const reasons = [...snapshot.long.blockers, ...snapshot.short.blockers];
      return {
        snapshotTime: snapshot.time,
        reasons,
        intents: [buildHoldIntent(bot.id, snapshot.time, reasons)],
        diagnostics: toDiagnostics(snapshot),
      } satisfies StrategyDecision<IndicatorBotIntentMeta>;
    },
  };
}
