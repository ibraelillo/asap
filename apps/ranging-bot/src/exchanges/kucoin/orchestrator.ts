import type { ExecutionContext, PositionState } from "@repo/trading-engine";
import type { BotRecord } from "../../monitoring/types";
import type { AccountRecord } from "../../monitoring/types";
import type { OrchestratorRunInput } from "../../contracts";
import { exchangeAdapterRegistry } from "../../exchange-adapter-registry";
import { createBotRuntime } from "../../runtime-orchestrator-factory";
import type { KucoinSignalProcessorOptions } from "./signal-processor";

export interface CreateKucoinOrchestratorInput {
  bot: BotRecord;
  executionContext: ExecutionContext<AccountRecord>;
  signalProcessorOptions?: KucoinSignalProcessorOptions;
}

export function createKucoinOrchestrator(input: CreateKucoinOrchestratorInput) {
  const marketDataAdapter = exchangeAdapterRegistry.getPublic("kucoin");
  const executionAdapter = exchangeAdapterRegistry.getPrivate("kucoin");
  const runtime = createBotRuntime({
    bot: input.bot,
    marketDataAdapter,
    executionAdapter,
    executionContext: input.executionContext,
    signalProcessorOptions: input.signalProcessorOptions,
  });

  return {
    ...runtime,
    runOnce: (
      runInput: Omit<OrchestratorRunInput, "bot">,
      position: PositionState | null,
    ) => runtime.runOnce(runInput, position),
  };
}
