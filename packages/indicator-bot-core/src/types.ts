import type { Side } from "@repo/trading-engine";

export interface IndicatorBotConfig {
  trend: {
    fastEmaLength: number;
    slowEmaLength: number;
    higherTimeframeEmaLength: number;
    slopeLookbackBars: number;
    minEmaSeparationPct: number;
    maxPriceDistanceFromFastEmaPct: number;
  };
  momentum: {
    rsiLength: number;
    longThreshold: number;
    longCeiling: number;
    shortThreshold: number;
    shortFloor: number;
  };
  volatility: {
    atrLength: number;
    stopAtrMultiple: number;
  };
  volume: {
    requireExpansion: boolean;
    volumeSmaLength: number;
    minVolumeRatio: number;
  };
  execution: {
    requirePrimaryTrendConfirmation: boolean;
    requireSecondaryTrendConfirmation: boolean;
    closeOnOppositeSignal: boolean;
  };
  risk: {
    riskPctPerTrade: number;
    maxNotionalPctEquity: number;
    tp1RewardMultiple: number;
    tp2RewardMultiple: number;
    tp1SizePct: number;
    tp2SizePct: number;
    moveStopToBreakevenOnTp1: boolean;
    cooldownBars: number;
  };
}

export interface IndicatorConfluenceChecks {
  trend: boolean;
  pullback: boolean;
  momentum: boolean;
  volume: boolean;
  primaryTrend: boolean;
  secondaryTrend: boolean;
}

export interface IndicatorBotSignalPlan {
  ready: boolean;
  reasons: string[];
  blockers: string[];
  checks: IndicatorConfluenceChecks;
}

export interface IndicatorBotSnapshot {
  time: number;
  price: number;
  fastEma: number;
  slowEma: number;
  fastSlopePct: number;
  emaSpreadPct: number;
  rsi: number;
  atr: number;
  volumeRatio: number;
  primaryTrend: Side | "neutral";
  secondaryTrend: Side | "neutral";
  long: IndicatorBotSignalPlan;
  short: IndicatorBotSignalPlan;
}

export interface IndicatorBotIntentMeta {
  setup: "trend-pullback";
  initialStopPrice: number;
  atr: number;
  rsi: number;
  volumeRatio: number;
  primaryTrend: Side | "neutral";
  secondaryTrend: Side | "neutral";
  emaSpreadPct: number;
}
