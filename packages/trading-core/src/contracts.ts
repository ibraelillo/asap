import { z } from "zod";

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

export const CandleSchema = z.object({
  time: z.number().int().nonnegative(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().finite().nonnegative(),
});
export type Candle = z.infer<typeof CandleSchema>;

export const DecisionActionSchema = z.enum(["trade", "hold", "avoid", "exit"]);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

export const DirectionSchema = z.enum(["long", "short"]);
export type Direction = z.infer<typeof DirectionSchema>;

export const StrategyDecisionSchema = z.object({
  action: DecisionActionSchema,
  direction: DirectionSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string()).default([]),
  recommendations: z.record(z.string(), z.unknown()).optional(),
});
export type StrategyDecision = z.infer<typeof StrategyDecisionSchema>;

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

export const BotSubscriptionSchema = z.object({
  id: z.string().min(1),
  deploymentId: z.string().min(1),
  accountId: z.string().min(1),
  executionPolicy: z.record(z.string(), z.unknown()),
});
export type BotSubscription = z.infer<typeof BotSubscriptionSchema>;

export const ContextReferenceSchema = z.object({
  exchangeId: z.string().min(1),
  symbol: z.string().min(1),
  timeframe: TimeframeSchema,
  closedCandleTime: z.number().int().nonnegative(),
  contextVersion: z.string().min(1),
});
export type ContextReference = z.infer<typeof ContextReferenceSchema>;

export interface StrategyDefinition<
  TConfig extends Record<string, unknown>,
  TContext,
  TDecision extends StrategyDecision,
> {
  id: string;
  version: string;
  configSchema: z.ZodType<TConfig>;
  contextSchema: z.ZodType<TContext>;
  decisionSchema: z.ZodType<TDecision>;
  decide(input: { deployment: StrategyDeployment; context: TContext }): TDecision;
}
