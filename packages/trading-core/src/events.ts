import { z } from "zod";
import {
  ContextReferenceSchema,
  StrategyDecisionSchema,
  type ContextReference,
  type StrategyDecision,
} from "./contracts";

export const DomainEventTypeSchema = z.enum([
  "context.built",
  "strategy.decision.emitted",
  "backtest.decision.recorded",
  "execution.signal.requested",
]);
export type DomainEventType = z.infer<typeof DomainEventTypeSchema>;

export const DecisionEventSchema = z.object({
  id: z.string().min(1),
  type: z.literal("strategy.decision.emitted"),
  strategyId: z.string().min(1),
  strategyVersion: z.string().min(1),
  deploymentId: z.string().min(1),
  symbol: z.string().min(1),
  decisionTime: z.number().int().nonnegative(),
  contextRefs: z.record(z.string(), ContextReferenceSchema),
  contextSnapshot: z.record(z.string(), z.unknown()),
  decision: StrategyDecisionSchema,
});
export type DecisionEvent = z.infer<typeof DecisionEventSchema>;

export function createDecisionEvent(input: {
  id: string;
  strategyId: string;
  strategyVersion: string;
  deploymentId: string;
  symbol: string;
  decisionTime: number;
  contextRefs: Record<string, ContextReference>;
  contextSnapshot: Record<string, unknown>;
  decision: StrategyDecision;
}): DecisionEvent {
  return DecisionEventSchema.parse({
    type: "strategy.decision.emitted",
    ...input,
  });
}
