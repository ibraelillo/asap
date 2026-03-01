import type { DecisionContext } from "@repo/market-context";
import {
  createDecisionEvent,
  type StrategyDecision,
  type StrategyDefinition,
  type StrategyDeployment,
} from "@repo/trading-core";

/**
 * Result of a single pure strategy execution step.
 *
 * The decision is returned for immediate use and the corresponding domain event
 * is returned for persistence, replay, or later publishing.
 */
export interface ExecutionStepResult<TDecision extends StrategyDecision> {
  decision: TDecision;
  event: ReturnType<typeof createDecisionEvent>;
}

/**
 * Executes one strategy deployment step from a prepared context.
 *
 * This function is intentionally infrastructure-free. It validates the input
 * context against the strategy contract, validates the emitted decision, and
 * then emits a normalized domain event containing copied context evidence.
 */
export function executeDeploymentStep<
  TConfig extends Record<string, unknown>,
  TContext,
  TDecision extends StrategyDecision,
>(input: {
  strategy: StrategyDefinition<TConfig, TContext, TDecision>;
  deployment: StrategyDeployment;
  context: TContext;
  symbol: string;
  contextRefs: Record<string, Parameters<typeof createDecisionEvent>[0]["contextRefs"][string]>;
  contextSnapshot: Record<string, unknown>;
  eventId: string;
  decisionTime: number;
}): ExecutionStepResult<TDecision> {
  const parsedContext = input.strategy.contextSchema.parse(input.context);
  const decision = input.strategy.decisionSchema.parse(
    input.strategy.decide({
      deployment: input.deployment,
      context: parsedContext,
    }),
  );

  const event = createDecisionEvent({
    id: input.eventId,
    strategyId: input.strategy.id,
    strategyVersion: input.strategy.version,
    deploymentId: input.deployment.id,
    symbol: input.symbol,
    decisionTime: input.decisionTime,
    contextRefs: input.contextRefs,
    contextSnapshot: input.contextSnapshot,
    decision,
  });

  return { decision, event };
}

/**
 * Replays a deployment over an ordered list of decision contexts.
 *
 * Backtests and research tools can use this directly to guarantee that the
 * same pure decision logic used in live mode is also used in historical
 * evaluation. The function deliberately stays simple: it produces decisions and
 * decision events, leaving execution simulation to higher layers.
 */
export function replayDeployment<
  TConfig extends Record<string, unknown>,
  TDecision extends StrategyDecision,
>(input: {
  strategy: StrategyDefinition<TConfig, DecisionContext, TDecision>;
  deployment: StrategyDeployment;
  contexts: DecisionContext[];
}): {
  decisions: ExecutionStepResult<TDecision>[];
} {
  const decisions = input.contexts.map((context, index) =>
    executeDeploymentStep({
      strategy: input.strategy,
      deployment: input.deployment,
      context,
      symbol: context.symbol,
      contextRefs: Object.fromEntries(
        Object.entries(context.contexts).map(([timeframe, timeframeContext]) => [
          timeframe,
          {
            exchangeId: "shared",
            symbol: timeframeContext.symbol,
            timeframe: timeframeContext.timeframe,
            closedCandleTime: timeframeContext.closedCandleTime,
            contextVersion: timeframeContext.contextVersion,
          },
        ]),
      ),
      contextSnapshot: context.contexts,
      eventId: `${input.deployment.id}-${index + 1}`,
      decisionTime: context.decisionTime,
    }),
  );

  return { decisions };
}
