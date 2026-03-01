import type {
  PositionState,
  StrategyDecision,
  TradingStrategy,
} from "@repo/trading-engine";
import type {
  OrchestratorDependencies,
  OrchestratorRunInput,
  StrategySignalEvent,
} from "./contracts";

export class BotRuntimeOrchestrator<TConfig, TSnapshot, TMeta = unknown> {
  constructor(
    private readonly deps: OrchestratorDependencies<TSnapshot, TMeta>,
    private readonly strategy: TradingStrategy<TConfig, TSnapshot, TMeta>,
    private readonly config: TConfig,
  ) {}

  async runOnce(
    input: OrchestratorRunInput,
    position: PositionState | null,
  ): Promise<StrategySignalEvent<TSnapshot, TMeta>> {
    const [executionCandles, primaryRangeCandles, secondaryRangeCandles] =
      await Promise.all([
        this.deps.klineProvider.fetchKlines({
          symbol: input.bot.symbol,
          timeframe: input.executionTimeframe,
          limit: input.executionLimit,
          endTimeMs: input.endTimeMs,
        }),
        this.deps.klineProvider.fetchKlines({
          symbol: input.bot.symbol,
          timeframe: input.primaryRangeTimeframe,
          limit: input.primaryRangeLimit,
          endTimeMs: input.endTimeMs,
        }),
        this.deps.klineProvider.fetchKlines({
          symbol: input.bot.symbol,
          timeframe: input.secondaryRangeTimeframe,
          limit: input.secondaryRangeLimit,
          endTimeMs: input.endTimeMs,
        }),
      ]);

    if (executionCandles.length === 0) {
      throw new Error(
        `No execution candles for ${input.bot.symbol} ${input.executionTimeframe}`,
      );
    }

    const market = {
      executionCandles,
      index: executionCandles.length - 1,
      series: {
        primaryRange: primaryRangeCandles,
        secondaryRange: secondaryRangeCandles,
      },
      indicators: this.deps.indicators,
    };

    const snapshot = this.strategy.buildSnapshot({
      bot: input.bot,
      config: this.config,
      market,
      position,
    });

    const decision: StrategyDecision<TMeta> = this.strategy.evaluate({
      bot: input.bot,
      config: this.config,
      snapshot,
      market,
      position,
    });

    const event: StrategySignalEvent<TSnapshot, TMeta> = {
      bot: input.bot,
      symbol: input.bot.symbol,
      generatedAtMs:
        executionCandles[executionCandles.length - 1]?.time ?? Date.now(),
      decision,
      snapshot,
      position,
    };

    const processing = await this.deps.signalProcessor.process(event);
    event.processing = processing;
    event.exchangePosition = processing.positionSnapshot ?? undefined;

    return event;
  }
}

export class NoopSignalProcessor<TSnapshot = unknown, TMeta = unknown> {
  async process(event: StrategySignalEvent<TSnapshot, TMeta>) {
    const enterIntent = event.decision.intents.find(
      (intent) => intent.kind === "enter",
    );
    return enterIntent
      ? { status: "dry-run" as const, side: enterIntent.side }
      : { status: "no-signal" as const };
  }
}

export class ConsoleSignalProcessor<TSnapshot = unknown, TMeta = unknown> {
  async process(event: StrategySignalEvent<TSnapshot, TMeta>) {
    console.log(`[orchestrator] ${event.bot.id}`, {
      symbol: event.symbol,
      decision: event.decision,
      generatedAtMs: event.generatedAtMs,
    });

    const enterIntent = event.decision.intents.find(
      (intent) => intent.kind === "enter",
    );
    return enterIntent
      ? { status: "dry-run" as const, side: enterIntent.side }
      : { status: "no-signal" as const };
  }
}
