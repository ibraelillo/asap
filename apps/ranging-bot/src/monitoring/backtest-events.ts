import type { OrchestratorTimeframe } from "../contracts";
import type { BacktestAiConfig } from "./types";

export const BACKTEST_EVENT_SOURCE = "asap.ranging.backtest";
export const BACKTEST_EVENT_DETAIL_TYPE_REQUESTED = "backtest.requested";

export interface BacktestRequestedDetail {
  backtestId: string;
  createdAtMs: number;
  botId: string;
  deploymentId: string;
  botName: string;
  strategyId: string;
  strategyVersion: string;
  exchangeId: string;
  accountId: string;
  symbol: string;
  strategyConfig?: Record<string, unknown>;
  fromMs: number;
  toMs: number;
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
  initialEquity: number;
  ai?: BacktestAiConfig;
}
