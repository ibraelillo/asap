import type {
  ExchangeKlineProvider,
  SignalProcessor,
  StrategyMarketContext,
  Timeframe,
} from "@repo/trading-engine";

export type {
  AccountResolver,
  ExchangeAccount,
  ExchangeAccountAuth,
  ExchangeAdapter,
  ExchangeKlineProvider,
  PrivateExecutionAdapter,
  PublicMarketDataAdapter,
  PublicMarketDataContext,
  ExchangePositionReader,
  ExchangePositionSnapshot,
  ExecutionContext,
  KlineQuery,
  SignalProcessingResult,
  SignalProcessingStatus,
  SignalProcessor,
  StrategySignalEvent,
} from "@repo/trading-engine";

export type OrchestratorTimeframe = Timeframe;

export interface OrchestratorRunInput {
  bot: import("@repo/trading-engine").BotDefinition;
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
  executionLimit: number;
  primaryRangeLimit: number;
  secondaryRangeLimit: number;
  endTimeMs?: number;
}

export interface OrchestratorDependencies<
  TSnapshot = unknown,
  TMeta = unknown,
> {
  klineProvider: ExchangeKlineProvider;
  signalProcessor: SignalProcessor<TSnapshot, TMeta>;
  indicators?: StrategyMarketContext["indicators"];
}
