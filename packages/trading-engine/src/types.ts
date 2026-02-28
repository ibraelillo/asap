export type Side = "long" | "short";

export type Timeframe =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "1w";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ContextProviderSpec {
  id: string;
  kind:
    | "price"
    | "indicator"
    | "validation"
    | "fundamental"
    | "news"
    | "custom";
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface BotDefinition {
  id: string;
  name: string;
  strategyId: string;
  strategyVersion: string;
  exchangeId: string;
  accountId: string;
  symbol: string;
  marketType: "spot" | "perp" | "futures";
  status: "active" | "paused" | "archived";
  execution: {
    trigger: "cron" | "event";
    executionTimeframe: Timeframe;
    warmupBars: number;
  };
  context: {
    primaryPriceTimeframe: Timeframe;
    additionalTimeframes: Timeframe[];
    providers: ContextProviderSpec[];
  };
  riskProfileId: string;
  strategyConfig: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StrategyMarketContext {
  executionCandles: Candle[];
  index: number;
  series: Record<string, Candle[]>;
  validations?: Record<string, unknown>;
}

export type PositionStatus =
  | "flat"
  | "entry-pending"
  | "open"
  | "reducing"
  | "closing"
  | "closed"
  | "reconciling"
  | "error";

export interface PositionState {
  botId: string;
  positionId: string;
  symbol: string;
  side: Side;
  status: PositionStatus;
  quantity: number;
  remainingQuantity: number;
  avgEntryPrice?: number;
  stopPrice?: number;
  realizedPnl: number;
  unrealizedPnl?: number;
  openedAtMs?: number;
  closedAtMs?: number;
  strategyContext?: Record<string, unknown>;
}

export interface StrategySnapshotInput<TConfig> {
  bot: BotDefinition;
  config: TConfig;
  market: StrategyMarketContext;
  position: PositionState | null;
}

export interface StrategyEvaluationInput<TConfig, TSnapshot> {
  bot: BotDefinition;
  config: TConfig;
  snapshot: TSnapshot;
  market: StrategyMarketContext;
  position: PositionState | null;
}

export interface IntentRisk {
  stopPrice: number;
}

export interface TakeProfitInstruction {
  id: string;
  label: string;
  price: number;
  sizeFraction: number;
  moveStopToBreakeven?: boolean;
}

export interface PositionManagementPlan {
  takeProfits?: TakeProfitInstruction[];
  closeOnOppositeIntent?: boolean;
  cooldownBars?: number;
}

export interface IntentBase<TMeta = unknown> {
  kind: string;
  botId: string;
  strategyId: string;
  time: number;
  reasons: string[];
  confidence?: number;
  tags?: string[];
  meta?: TMeta;
}

export interface EnterPositionIntent<TMeta = unknown>
  extends IntentBase<TMeta> {
  kind: "enter";
  side: Side;
  entry: {
    type: "market" | "limit";
    price?: number;
  };
  risk: IntentRisk;
  management?: PositionManagementPlan;
}

export interface ReducePositionIntent<TMeta = unknown>
  extends IntentBase<TMeta> {
  kind: "reduce";
  side: Side;
  price?: number;
  sizeFraction: number;
}

export interface MoveStopIntent<TMeta = unknown> extends IntentBase<TMeta> {
  kind: "move-stop";
  side: Side;
  stopPrice: number;
}

export interface ClosePositionIntent<TMeta = unknown>
  extends IntentBase<TMeta> {
  kind: "close";
  side: Side;
  price?: number;
}

export interface HoldIntent<TMeta = unknown> extends IntentBase<TMeta> {
  kind: "hold";
}

export type TradingIntent<TMeta = unknown> =
  | EnterPositionIntent<TMeta>
  | ReducePositionIntent<TMeta>
  | MoveStopIntent<TMeta>
  | ClosePositionIntent<TMeta>
  | HoldIntent<TMeta>;

export interface StrategyDecision<TMeta = unknown> {
  snapshotTime: number;
  confidence?: number;
  reasons: string[];
  intents: TradingIntent<TMeta>[];
  diagnostics?: Record<string, unknown>;
}

export interface TradingStrategy<TConfig, TSnapshot, TIntentsMeta = unknown> {
  readonly id: string;
  readonly version: string;
  buildSnapshot(input: StrategySnapshotInput<TConfig>): TSnapshot;
  evaluate(
    input: StrategyEvaluationInput<TConfig, TSnapshot>,
  ): StrategyDecision<TIntentsMeta>;
}

export interface SlippageModelSpec {
  type: "none" | "fixed-bps";
  bps?: number;
}

export interface FeeModelSpec {
  type: "fixed-rate";
  rate: number;
}

export interface BacktestRequest {
  id: string;
  botId: string;
  fromMs: number;
  toMs: number;
  chartTimeframe: Timeframe;
  initialEquity: number;
  slippageModel: SlippageModelSpec;
  feeModel: FeeModelSpec;
  contextOverrides?: Record<string, unknown>;
  aiValidation?: {
    enabled: boolean;
    lookbackCandles: number;
    cadenceBars: number;
    maxEvaluations: number;
    confidenceThreshold: number;
    modelPrimary: string;
    modelFallback: string;
  };
  createdAtMs: number;
}

export interface SimulatedOrder {
  id: string;
  botId: string;
  positionId: string;
  side: Side;
  purpose: "entry" | "reduce" | "stop" | "take-profit" | "close" | "reconcile";
  status: "submitted" | "filled" | "canceled" | "rejected";
  requestedPrice?: number;
  executedPrice?: number;
  requestedQuantity: number;
  executedQuantity?: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SimulatedFill {
  id: string;
  orderId: string;
  positionId: string;
  botId: string;
  reason: "entry" | "tp" | "stop" | "signal" | "end" | "reduce";
  label?: string;
  side: Side;
  time: number;
  price: number;
  quantity: number;
  grossPnl: number;
  fee: number;
  netPnl: number;
}

export interface SimulatedPosition<TMeta = unknown> extends PositionState {
  entryFee: number;
  fills: SimulatedFill[];
  management?: PositionManagementPlan;
  closePrice?: number;
  meta?: TMeta;
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface BacktestTimelineEvent {
  time: number;
  type:
    | "strategy.decision"
    | "position.opened"
    | "position.reduced"
    | "position.closed"
    | "stop.moved";
  positionId?: string;
  message: string;
  data?: Record<string, unknown>;
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

export interface BacktestResult<TMeta = unknown> {
  botId: string;
  strategyId: string;
  metrics: BacktestMetrics;
  positions: SimulatedPosition<TMeta>[];
  orders: SimulatedOrder[];
  fills: SimulatedFill[];
  equityCurve: EquityPoint[];
  timeline: BacktestTimelineEvent[];
  diagnostics?: Record<string, unknown>;
}

export interface PositionSizingResult {
  quantity: number;
  riskAmount?: number;
  stopDistance?: number;
  notional?: number;
  estimatedLossAtStop?: number;
  usedNotionalCap?: boolean;
}

export interface PositionSizingInput<TConfig, TSnapshot, TMeta = unknown> {
  bot: BotDefinition;
  config: TConfig;
  snapshot: TSnapshot;
  decision: StrategyDecision<TMeta>;
  intent: EnterPositionIntent<TMeta>;
  candle: Candle;
  equity: number;
}

export type PositionSizer<TConfig, TSnapshot, TMeta = unknown> = (
  input: PositionSizingInput<TConfig, TSnapshot, TMeta>,
) => PositionSizingResult;

export interface BacktestEngineInput<TConfig, TSnapshot, TMeta = unknown> {
  request: BacktestRequest;
  bot: BotDefinition;
  config: TConfig;
  strategy: TradingStrategy<TConfig, TSnapshot, TMeta>;
  market: {
    executionCandles: Candle[];
    series: Record<string, Candle[]>;
  };
  positionSizer: PositionSizer<TConfig, TSnapshot, TMeta>;
  initialPosition?: SimulatedPosition<TMeta> | null;
}
