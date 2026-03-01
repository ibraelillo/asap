import { z } from "zod";
import {
  ContextReferenceSchema,
  StrategyDecisionSchema,
  type ContextReference,
  type StrategyDecision,
} from "./contracts";

/**
 * Core domain event catalogue. These names form the stable language between
 * pure strategy code and the application/infrastructure layers.
 */
export const DomainEventTypeSchema = z.enum([
  "context.built",
  "strategy.decision.emitted",
  "backtest.decision.recorded",
  "execution.signal.requested",
]);
export type DomainEventType = z.infer<typeof DomainEventTypeSchema>;

/**
 * Immutable event emitted when a strategy produces a decision from a concrete
 * context snapshot.
 *
 * The event stores both lightweight references and a copied snapshot so later
 * audits do not depend on external mutable storage.
 */
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

/**
 * Creates and validates a normalized decision event. Centralizing construction
 * here prevents partial or inconsistent event payloads from leaking into the
 * rest of the system.
 */
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
