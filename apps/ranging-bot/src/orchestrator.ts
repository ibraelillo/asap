import type { Candle } from "@repo/ranging-core";
import type {
  OrchestratorDependencies,
  OrchestratorRunInput,
  SignalProcessingResult,
  SignalProcessor,
  StrategySignalEvent,
} from "./contracts";

export class ExchangeRangingOrchestrator {
  constructor(private readonly deps: OrchestratorDependencies) {}

  async runOnce(input: OrchestratorRunInput): Promise<StrategySignalEvent> {
    const [executionCandles, primaryRangeCandles, secondaryRangeCandles] = await Promise.all([
      this.deps.klineProvider.fetchKlines({
        symbol: input.symbol,
        timeframe: input.executionTimeframe,
        limit: input.executionLimit,
        endTimeMs: input.endTimeMs,
      }),
      this.deps.klineProvider.fetchKlines({
        symbol: input.symbol,
        timeframe: input.primaryRangeTimeframe,
        limit: input.primaryRangeLimit,
        endTimeMs: input.endTimeMs,
      }),
      this.deps.klineProvider.fetchKlines({
        symbol: input.symbol,
        timeframe: input.secondaryRangeTimeframe,
        limit: input.secondaryRangeLimit,
        endTimeMs: input.endTimeMs,
      }),
    ]);

    if (executionCandles.length === 0) {
      throw new Error(`No execution candles for ${input.symbol} ${input.executionTimeframe}`);
    }

    const snapshot = this.deps.bot.buildSignalSnapshot({
      executionCandles,
      index: executionCandles.length - 1,
      primaryRangeCandles,
      secondaryRangeCandles,
    });

    const decision = this.deps.bot.evaluateEntry(snapshot);

    const event: StrategySignalEvent = {
      symbol: input.symbol,
      generatedAtMs: snapshot.time,
      decision,
      snapshot,
    };

    const processing = await this.deps.signalProcessor.process(event);
    event.processing = processing;

    return event;
  }
}

export class NoopSignalProcessor implements SignalProcessor {
  async process(_event: StrategySignalEvent): Promise<SignalProcessingResult> {
    return { status: "no-signal" };
  }
}

export class ConsoleSignalProcessor implements SignalProcessor {
  async process(event: StrategySignalEvent): Promise<SignalProcessingResult> {
    console.log(`[orchestrator] ${event.symbol}`, {
      decision: event.decision,
      snapshot: {
        time: event.snapshot.time,
        price: event.snapshot.price,
        range: event.snapshot.range.effective,
      },
    });

    return event.decision.signal
      ? { status: "dry-run", side: event.decision.signal }
      : { status: "no-signal" };
  }
}

export function ensureSortedCandles(candles: Candle[]): Candle[] {
  return [...candles].sort((a, b) => a.time - b.time);
}
