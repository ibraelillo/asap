import type {
  ExchangeAccount,
  ExchangeKlineProvider,
  ExecutionContext,
  PrivateExecutionAdapter,
  PositionState,
  PublicMarketDataAdapter,
} from "@repo/trading-engine";
import type { BotRecord } from "./monitoring/types";
import type { OrchestratorRunInput } from "./contracts";
import { BotRuntimeOrchestrator } from "./orchestrator";
import { strategyRegistry } from "./strategy-registry";

export interface CreateBotRuntimeInput<
  TAccount extends ExchangeAccount = ExchangeAccount,
> {
  bot: BotRecord;
  marketDataAdapter: PublicMarketDataAdapter;
  executionAdapter: PrivateExecutionAdapter<TAccount>;
  executionContext: ExecutionContext<TAccount>;
  signalProcessorOptions?: unknown;
  klineProviderOverride?: ExchangeKlineProvider;
}

export function createBotRuntime<
  TAccount extends ExchangeAccount = ExchangeAccount,
>(input: CreateBotRuntimeInput<TAccount>) {
  const resolved = strategyRegistry.get(input.bot);
  const klineProvider =
    input.klineProviderOverride ??
    input.marketDataAdapter.createKlineProvider({
      exchangeId: input.executionContext.exchangeId,
      nowMs: input.executionContext.nowMs,
      metadata: {
        botId: input.bot.id,
        symbol: input.bot.symbol,
        source: "runtime-orchestrator",
      },
    });
  const signalProcessor = input.executionAdapter.createSignalProcessor(
    input.executionContext,
    input.signalProcessorOptions,
  );

  const orchestrator = new BotRuntimeOrchestrator(
    {
      klineProvider,
      signalProcessor,
    },
    resolved.strategy,
    resolved.config,
  );

  return {
    strategy: resolved.strategy,
    config: resolved.config,
    klineProvider,
    signalProcessor,
    orchestrator,
    runOnce: (
      runInput: Omit<OrchestratorRunInput, "bot">,
      position: PositionState | null,
    ) => orchestrator.runOnce({ ...runInput, bot: input.bot }, position),
  };
}
