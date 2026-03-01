import type { DecisionContext } from "@repo/market-context";
import type {
  BacktestTradeSummary,
  StrategyBacktestRequest,
  StrategyBacktestResult,
  StrategyDecision,
  StrategyPackage,
} from "@repo/trading-core";
import { replayDeployment } from "./runtime";

/**
 * Runs a pure strategy package backtest.
 *
 * The runtime is responsible only for:
 * - replaying prepared decision contexts through the pure strategy
 * - producing auditable decision records
 * - handing those records to the strategy-owned trade engine
 *
 * It deliberately does not know how to simulate entries, exits, DCA ladders,
 * or continuous re-entry. That behavior belongs to the strategy package's
 * trade engine.
 */
export function runStrategyBacktest<
  TConfig extends Record<string, unknown>,
  TContext extends DecisionContext,
  TDecision extends StrategyDecision,
  TTrade extends BacktestTradeSummary = BacktestTradeSummary,
  TArtifacts = Record<string, unknown>,
>(input: {
  strategyPackage: StrategyPackage<
    TConfig,
    TContext,
    TDecision,
    TTrade,
    TArtifacts
  >;
  request: StrategyBacktestRequest<TContext>;
}): StrategyBacktestResult<TDecision, TTrade, TArtifacts> {
  const replay = replayDeployment({
    strategy: input.strategyPackage.definition,
    deployment: input.request.deployment,
    contexts: input.request.contexts,
  });

  const decisions = replay.decisions.map((record, index) => ({
    index,
    ...record,
  }));

  const tradeEngineResult = input.strategyPackage.tradeEngine.run({
    request: input.request,
    decisions,
  });

  return {
    requestId: input.request.requestId,
    deploymentId: input.request.deployment.id,
    strategyId: input.strategyPackage.definition.id,
    strategyVersion: input.strategyPackage.definition.version,
    decisions,
    trades: tradeEngineResult.trades,
    metrics: tradeEngineResult.metrics,
    artifacts: tradeEngineResult.artifacts,
  };
}
