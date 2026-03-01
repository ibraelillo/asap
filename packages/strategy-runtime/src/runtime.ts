import type { DecisionContext } from "@repo/market-context";
import {
  createDecisionEvent,
  type StrategyDecision,
  type StrategyDefinition,
  type StrategyDeployment,
} from "@repo/trading-core";

export interface ExecutionStepResult<TDecision extends StrategyDecision> {
  decision: TDecision;
  event: ReturnType<typeof createDecisionEvent>;
}

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
