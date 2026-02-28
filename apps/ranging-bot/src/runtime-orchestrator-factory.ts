import type {
  ExchangeAccount,
  ExchangeAdapter,
  ExecutionContext,
  PositionState,
} from "@repo/trading-engine";
import type { BotRecord } from "./monitoring/types";
import type { OrchestratorRunInput } from "./contracts";
import { BotRuntimeOrchestrator } from "./orchestrator";
import { strategyRegistry } from "./strategy-registry";

export interface CreateBotRuntimeInput<TAccount extends ExchangeAccount = ExchangeAccount> {
  bot: BotRecord;
  adapter: ExchangeAdapter<TAccount>;
  executionContext: ExecutionContext<TAccount>;
  signalProcessorOptions?: unknown;
}

export function createBotRuntime<TAccount extends ExchangeAccount = ExchangeAccount>(
  input: CreateBotRuntimeInput<TAccount>,
) {
  const resolved = strategyRegistry.get(input.bot);
  const klineProvider = input.adapter.createKlineProvider(input.executionContext);
  const signalProcessor = input.adapter.createSignalProcessor(
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
