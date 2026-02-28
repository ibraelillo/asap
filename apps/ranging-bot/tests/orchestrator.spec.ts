import {
  createConfiguredRangeReversalStrategy,
  createRangeReversalBotDefinition,
} from "@repo/ranging-core";
import { describe, expect, it } from "vitest";
import type { Candle } from "@repo/ranging-core";
import type {
  ExchangeKlineProvider,
  KlineQuery,
  SignalProcessor,
  StrategySignalEvent,
} from "../src/contracts";
import { BotRuntimeOrchestrator } from "../src/orchestrator";

function candle(
  time: number,
  price: number,
  features?: Record<string, unknown>,
): Candle & { features?: Record<string, unknown> } {
  return {
    time,
    open: price,
    high: price + 1,
    low: price - 1,
    close: price,
    volume: 100,
    ...(features ? { features } : {}),
  };
}

class FakeProvider implements ExchangeKlineProvider {
  calls: KlineQuery[] = [];

  constructor(
    private readonly byTf: Record<
      string,
      (Candle & { features?: Record<string, unknown> })[]
    >,
  ) {}

  async fetchKlines(query: KlineQuery): Promise<Candle[]> {
    this.calls.push(query);
    return this.byTf[query.timeframe] ?? [];
  }
}

class CapturingProcessor implements SignalProcessor {
  events: StrategySignalEvent[] = [];

  async process(
    event: StrategySignalEvent,
  ): Promise<{ status: "dry-run" | "no-signal" }> {
    this.events.push(event);
    const enterIntent = event.decision.intents.find(
      (intent) => intent.kind === "enter",
    );
    return enterIntent
      ? { status: "dry-run", side: enterIntent.side }
      : { status: "no-signal" };
  }
}

describe("exchange orchestrator", () => {
  it("fetches klines, evaluates signal, and forwards event", async () => {
    const bot = createRangeReversalBotDefinition({
      botId: "orchestrator-test-bot",
      symbol: "SOLUSDTM",
      executionTimeframe: "15m",
    });
    const { strategy, config } = createConfiguredRangeReversalStrategy();

    const exec = [
      candle(1, 100),
      candle(2, 100, {
        rangeValid: true,
        val: 101,
        vah: 110,
        poc: 103,
        bullishDivergence: true,
        bearishDivergence: false,
        moneyFlowSlope: 0.5,
        bullishSfp: true,
        bearishSfp: false,
      }),
    ];

    const provider = new FakeProvider({
      "15m": exec,
      "1d": exec,
      "4h": exec,
    });

    const processor = new CapturingProcessor();

    const orchestrator = new BotRuntimeOrchestrator(
      {
        klineProvider: provider,
        signalProcessor: processor,
      },
      strategy,
      config,
    );

    const event = await orchestrator.runOnce(
      {
        bot,
        executionTimeframe: "15m",
        primaryRangeTimeframe: "1d",
        secondaryRangeTimeframe: "4h",
        executionLimit: 200,
        primaryRangeLimit: 60,
        secondaryRangeLimit: 120,
      },
      null,
    );

    expect(provider.calls).toHaveLength(3);
    expect(
      event.decision.intents.find((intent) => intent.kind === "enter"),
    ).toMatchObject({
      kind: "enter",
      side: "long",
    });
    expect(processor.events).toHaveLength(1);
    expect(processor.events[0]).toEqual(event);
  });
});
