import { z } from "zod";

/**
 * Canonical timeframe vocabulary used across strategy deployments, contexts,
 * and decisions. Keeping this enum in the domain core prevents individual
 * strategies or adapters from inventing incompatible timeframe identifiers.
 */
export const TimeframeSchema = z.enum([
  "5m",
  "15m",
  "1h",
  "2h",
  "4h",
  "8h",
  "12h",
  "1d",
  "1w",
]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

/**
 * Immutable OHLCV candle shape used by pure domain and context-building code.
 *
 * `time` is expected to be the close timestamp of the candle in epoch
 * milliseconds. Downstream context builders rely on candles being ordered
 * ascending by this field.
 */
export const CandleSchema = z.object({
  time: z.number().int().nonnegative(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().finite().nonnegative(),
});
export type Candle = z.infer<typeof CandleSchema>;

/**
 * Domain-level decision verbs produced by strategies before any execution
 * policy is applied by bots or simulated by backtests.
 */
export const DecisionActionSchema = z.enum(["trade", "hold", "avoid", "exit"]);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

/**
 * Direction is intentionally absent for non-directional actions such as `hold`
 * or `avoid`.
 */
export const DirectionSchema = z.enum(["long", "short"]);
export type Direction = z.infer<typeof DirectionSchema>;

/**
 * Normalized output contract for a strategy decision.
 *
 * Strategies are free to attach richer recommendation payloads, but the core
 * keeps the top-level outcome stable and serializable.
 */
export const StrategyDecisionSchema = z.object({
  action: DecisionActionSchema,
  direction: DirectionSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string()).default([]),
  recommendations: z.record(z.string(), z.unknown()).optional(),
});
export type StrategyDecision = z.infer<typeof StrategyDecisionSchema>;

/**
 * A deployment binds a strategy version to a concrete symbol universe,
 * execution cadence, and strategy configuration. Strategies stay reusable and
 * independent; deployments are what actually get evaluated in live or
 * backtest mode.
 */
export const StrategyDeploymentSchema = z.object({
  id: z.string().min(1),
  strategyId: z.string().min(1),
  strategyVersion: z.string().min(1),
  symbolUniverse: z.array(z.string().min(1)).min(1),
  executionTimeframe: TimeframeSchema,
  requiredTimeframes: z.array(TimeframeSchema).min(1),
  config: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type StrategyDeployment = z.infer<typeof StrategyDeploymentSchema>;

/**
 * Execution-facing subscription record. Bots subscribe to a deployment and add
 * account/risk/execution policy on top of pure strategy decisions.
 */
export const BotSubscriptionSchema = z.object({
  id: z.string().min(1),
  deploymentId: z.string().min(1),
  accountId: z.string().min(1),
  executionPolicy: z.record(z.string(), z.unknown()),
});
export type BotSubscription = z.infer<typeof BotSubscriptionSchema>;

/**
 * Stable pointer to the exact context snapshot used during a decision. This
 * lets us audit or replay decisions without depending on mutable runtime
 * state.
 */
export const ContextReferenceSchema = z.object({
  exchangeId: z.string().min(1),
  symbol: z.string().min(1),
  timeframe: TimeframeSchema,
  closedCandleTime: z.number().int().nonnegative(),
  contextVersion: z.string().min(1),
});
export type ContextReference = z.infer<typeof ContextReferenceSchema>;

/**
 * Pure strategy definition contract.
 *
 * The strategy receives a validated context and deployment, then produces a
 * validated domain decision. It does not know about bots, accounts, exchanges,
 * persistence, or infrastructure.
 */
export interface StrategyDefinition<
  TConfig extends Record<string, unknown>,
  TContext,
  TDecision extends StrategyDecision,
> {
  /** Stable strategy family identifier, for example `range-reversal`. */
  id: string;
  /** Version identifier used for auditability and coexistence of variants. */
  version: string;
  /** Canonical configuration schema for deployment/runtime validation. */
  configSchema: z.ZodType<TConfig>;
  /** Schema describing the exact context shape the strategy expects. */
  contextSchema: z.ZodType<TContext>;
  /** Schema describing the exact decision shape the strategy emits. */
  decisionSchema: z.ZodType<TDecision>;
  /**
   * Pure decision function.
   *
   * Implementations should be deterministic for a given `(deployment, context)`
   * pair so replay and backtesting remain trustworthy.
   */
  decide(input: { deployment: StrategyDeployment; context: TContext }): TDecision;
}
