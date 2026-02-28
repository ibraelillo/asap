import type {
  BacktestMetrics as EngineBacktestMetrics,
  BacktestResult as EngineBacktestResult,
  BotDefinition,
  Candle,
  EquityPoint,
  Side,
  StrategyDecision,
  Timeframe,
} from "@repo/trading-engine";

export type { BotDefinition, Candle, EquityPoint, Side, Timeframe } from "@repo/trading-engine";

export interface ValueAreaLevels {
  val: number;
  vah: number;
  poc: number;
}

export interface FeatureOverrides {
  rangeValid?: boolean;
  val?: number;
  vah?: number;
  poc?: number;
  bullishDivergence?: boolean;
  bearishDivergence?: boolean;
  moneyFlowSlope?: number;
  bullishSfp?: boolean;
  bearishSfp?: boolean;
  recentLowBrokeVal?: boolean;
  recentHighBrokeVah?: boolean;
}

export interface BacktestCandle extends Candle {
  features?: FeatureOverrides;
}

export interface RangeContext {
  primary: ValueAreaLevels;
  secondary: ValueAreaLevels;
  effective: ValueAreaLevels;
  overlapRatio: number;
  isAligned: boolean;
}

export interface RangeReversalSnapshot {
  time: number;
  price: number;
  range: RangeContext;
  bullishDivergence: boolean;
  bearishDivergence: boolean;
  moneyFlowSlope: number;
  bullishSfp: boolean;
  bearishSfp: boolean;
  recentLowBrokeVal: boolean;
  recentHighBrokeVah: boolean;
}

export interface RangeReversalDecisionDiagnostics {
  signal: Side | null;
  failedLongReasons: string[];
  failedShortReasons: string[];
}

export interface EntryDecision {
  signal: Side | null;
  reasons: string[];
}

export type SignalSnapshot = RangeReversalSnapshot;

export interface RiskConfig {
  riskPctPerTrade: number;
  maxNotionalPctEquity: number;
  leverage: number;
  contractMultiplier: number;
  lotStep: number;
  feeRate: number;
  slBufferPct: number;
}

export interface RangeConfig {
  primaryLookbackBars: number;
  secondaryLookbackBars: number;
  bins: number;
  valueAreaPct: number;
  minOverlapPct: number;
}

export interface SignalConfig {
  waveTrendChannelLength: number;
  waveTrendAverageLength: number;
  waveTrendSignalLength: number;
  moneyFlowPeriod: number;
  moneyFlowSlopeBars: number;
  swingLookback: number;
  requireDivergence: boolean;
  requireSfp: boolean;
  maxBarsAfterDivergence: number;
  priceExcursionLookbackBars: number;
  allowArmedReentry: boolean;
  armedReentryMaxDistancePct: number;
}

export type RangeLevel = "VAL" | "VAH" | "POC";

export interface ExitConfig {
  tp1Level: RangeLevel;
  tp2LongLevel: RangeLevel;
  tp2ShortLevel: RangeLevel;
  tp1SizePct: number;
  tp2SizePct: number;
  moveStopToBreakevenOnTp1: boolean;
  runnerExitOnOppositeSignal: boolean;
  cooldownBars: number;
}

export interface FillModelConfig {
  intrabarExitPriority: "stop-first" | "target-first";
}

export interface RangeReversalConfig {
  range: RangeConfig;
  signal: SignalConfig;
  risk: RiskConfig;
  exits: ExitConfig;
  fillModel: FillModelConfig;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface BacktestInput {
  initialEquity: number;
  executionCandles: BacktestCandle[];
  primaryRangeCandles?: Candle[];
  secondaryRangeCandles?: Candle[];
}

export interface BacktestExit {
  reason: "tp1" | "tp2" | "stop" | "signal" | "end";
  time: number;
  price: number;
  quantity: number;
  grossPnl: number;
  fee: number;
  netPnl: number;
}

export interface BacktestTrade {
  id: number;
  side: Side;
  entryTime: number;
  entryPrice: number;
  stopPriceAtEntry: number;
  quantity: number;
  entryFee: number;
  exits: BacktestExit[];
  closeTime: number;
  closePrice: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
}

export type BacktestMetrics = EngineBacktestMetrics;

export interface BacktestResult {
  config: RangeReversalConfig;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  engine?: EngineBacktestResult<RangeReversalIntentMeta>;
}

export interface RangeReversalIntentMeta {
  range: ValueAreaLevels;
  stopPrice: number;
  tp1Price: number;
  tp2Price: number;
  diagnostics: RangeReversalDecisionDiagnostics;
}

export type RangeReversalStrategyDecision = StrategyDecision<RangeReversalIntentMeta>;

export interface RangeReversalBotDefinitionInput {
  botId: string;
  symbol: string;
  executionTimeframe?: Timeframe;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export function createRangeReversalBotDefinition(
  input: RangeReversalBotDefinitionInput,
): BotDefinition {
  const createdAtMs = input.createdAtMs ?? Date.now();
  const updatedAtMs = input.updatedAtMs ?? createdAtMs;

  return {
    id: input.botId,
    name: input.symbol,
    strategyId: "range-reversal",
    strategyVersion: "1",
    exchangeId: "paper",
    accountId: "default",
    symbol: input.symbol,
    marketType: "futures",
    status: "active",
    execution: {
      trigger: "cron",
      executionTimeframe: input.executionTimeframe ?? "1h",
      warmupBars: 120,
    },
    context: {
      primaryPriceTimeframe: input.executionTimeframe ?? "1h",
      additionalTimeframes: ["4h", "1d"],
      providers: [],
    },
    riskProfileId: `${input.botId}:risk`,
    strategyConfig: {},
    createdAtMs,
    updatedAtMs,
  };
}
