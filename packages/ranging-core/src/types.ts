export type Side = "long" | "short";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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

export interface SignalSnapshot {
  time: number;
  price: number;
  range: RangeContext;
  bullishDivergence: boolean;
  bearishDivergence: boolean;
  moneyFlowSlope: number;
  bullishSfp: boolean;
  bearishSfp: boolean;
}

export interface EntryDecision {
  signal: Side | null;
  reasons: string[];
}

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

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  maxDrawdownPct: number;
  endingEquity: number;
}

export interface BacktestResult {
  config: RangeReversalConfig;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
}
