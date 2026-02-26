import { createRangingBot, type DeepPartial, type RangeReversalConfig } from "@repo/ranging-core";
import type { KucoinClient, KucoinService } from "@repo/kucoin";
import type { OrchestratorRunInput } from "../../contracts";
import { ExchangeRangingOrchestrator } from "../../orchestrator";
import { KucoinKlineProvider } from "./klines";
import { KucoinSignalProcessor, type KucoinSignalProcessorOptions } from "./signal-processor";

export interface CreateKucoinOrchestratorInput {
  client: KucoinClient;
  service: KucoinService;
  strategyConfig?: DeepPartial<RangeReversalConfig>;
  signalProcessorOptions?: KucoinSignalProcessorOptions;
}

export function createKucoinOrchestrator(input: CreateKucoinOrchestratorInput) {
  const bot = createRangingBot(input.strategyConfig);
  const klineProvider = new KucoinKlineProvider(input.client);
  const signalProcessor = new KucoinSignalProcessor(
    input.service,
    input.signalProcessorOptions,
  );

  const orchestrator = new ExchangeRangingOrchestrator({
    bot,
    klineProvider,
    signalProcessor,
  });

  return {
    bot,
    klineProvider,
    signalProcessor,
    orchestrator,
    runOnce: (runInput: OrchestratorRunInput) => orchestrator.runOnce(runInput),
  };
}
