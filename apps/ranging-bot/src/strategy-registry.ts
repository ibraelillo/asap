import {
  computeVolumeProfileLevels,
  createConfig as createRangeReversalConfig,
  createConfiguredRangeReversalStrategy,
  type BacktestCandle,
  type DeepPartial,
  type RangeReversalConfig,
} from "@repo/ranging-core";
import {
  createConfiguredIndicatorBotStrategy,
  type IndicatorBotConfig,
} from "@repo/indicator-bot-core";
import {
  runBacktestEngine,
  type BacktestMetrics,
  type BotDefinition,
  type Candle,
  type EquityPoint,
  type Timeframe,
  type TradingStrategy,
} from "@repo/trading-engine";
import type { BotRecord, BacktestTradeView } from "./monitoring/types";

export interface StrategyBacktestInput {
  botId: string;
  symbol: string;
  initialEquity: number;
  executionTimeframe: Timeframe;
  executionCandles: Candle[];
  primaryRangeCandles: Candle[];
  secondaryRangeCandles: Candle[];
}

export interface StrategyRangeEstimate {
  val: number;
  poc: number;
  vah: number;
}

export interface StrategyBacktestArtifacts {
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  trades: BacktestTradeView[];
  diagnostics?: Record<string, unknown>;
}

export interface StrategyManifest<
  TConfig = unknown,
  TSnapshot = unknown,
  TMeta = unknown,
> {
  id: string;
  version: string;
  label: string;
  description: string;
  resolveConfig(raw?: Record<string, unknown>): TConfig;
  createStrategy(config: TConfig): TradingStrategy<TConfig, TSnapshot, TMeta>;
  runBacktest(
    input: StrategyBacktestInput,
    config: TConfig,
  ): StrategyBacktestArtifacts;
  estimateValidationRange(candles: Candle[]): StrategyRangeEstimate;
}

export interface ResolvedStrategy<
  TConfig = unknown,
  TSnapshot = unknown,
  TMeta = unknown,
> {
  manifest: StrategyManifest<TConfig, TSnapshot, TMeta>;
  config: TConfig;
  strategy: TradingStrategy<TConfig, TSnapshot, TMeta>;
}

export interface StrategyRegistry {
  get(bot: BotRecord): ResolvedStrategy;
  getManifest(strategyId: string): StrategyManifest;
  listManifests(): StrategyManifest[];
}

function createSyntheticBacktestBotDefinition(input: {
  botId: string;
  symbol: string;
  strategyId: string;
  strategyVersion: string;
  executionTimeframe: Timeframe;
}): BotDefinition {
  const nowMs = Date.now();
  return {
    id: input.botId,
    name: input.symbol,
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    exchangeId: "paper",
    accountId: "default",
    symbol: input.symbol,
    marketType: "futures",
    status: "active",
    execution: {
      trigger: "event",
      executionTimeframe: input.executionTimeframe,
      warmupBars: 0,
    },
    context: {
      primaryPriceTimeframe: input.executionTimeframe,
      additionalTimeframes: [],
      providers: [],
    },
    riskProfileId: `${input.botId}:risk`,
    strategyConfig: {},
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

function toVolumeProfileRange(candles: Candle[]): StrategyRangeEstimate {
  const levels = computeVolumeProfileLevels(candles);
  return {
    val: levels.val,
    poc: levels.poc,
    vah: levels.vah,
  };
}

function toSimpleRange(candles: Candle[]): StrategyRangeEstimate {
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last) {
    return {
      val: 0,
      poc: 0,
      vah: 0,
    };
  }

  const val = candles.reduce(
    (acc, candle) => Math.min(acc, candle.low),
    Number.POSITIVE_INFINITY,
  );
  const vah = candles.reduce(
    (acc, candle) => Math.max(acc, candle.high),
    Number.NEGATIVE_INFINITY,
  );
  const poc = last.close;

  return {
    val: Number.isFinite(val) ? val : first.low,
    poc,
    vah: Number.isFinite(vah) ? vah : first.high,
  };
}

const rangeReversalManifest: StrategyManifest<RangeReversalConfig> = {
  id: "range-reversal",
  version: "1",
  label: "Range Reversal",
  description:
    "Daily + 4h aligned value-area reversal strategy with divergence, money flow, and SFP confirmation.",
  resolveConfig(raw) {
    return createRangeReversalConfig(
      (raw ?? {}) as DeepPartial<RangeReversalConfig>,
    );
  },
  createStrategy(config) {
    return createConfiguredRangeReversalStrategy(config).strategy;
  },
  runBacktest(input, config) {
    const configured = createConfiguredRangeReversalStrategy(config);
    const executionCandles = input.executionCandles as BacktestCandle[];
    const result = configured.runBacktest({
      initialEquity: input.initialEquity,
      executionCandles,
      primaryRangeCandles: input.primaryRangeCandles,
      secondaryRangeCandles: input.secondaryRangeCandles,
    });

    const indexByTime = new Map<number, number>();
    executionCandles.forEach((candle, index) => {
      indexByTime.set(candle.time, index);
    });

    const trades = result.trades.map((trade) => {
      const entryIndex = indexByTime.get(trade.entryTime);
      if (entryIndex === undefined) {
        return {
          ...trade,
          exits: [...trade.exits],
        } satisfies BacktestTradeView;
      }

      try {
        const snapshot = configured.buildSignalSnapshot({
          executionCandles,
          index: entryIndex,
          primaryRangeCandles: input.primaryRangeCandles,
          secondaryRangeCandles: input.secondaryRangeCandles,
        });

        return {
          ...trade,
          exits: [...trade.exits],
          rangeLevels: {
            val: snapshot.range.effective.val,
            vah: snapshot.range.effective.vah,
            poc: snapshot.range.effective.poc,
          },
        } satisfies BacktestTradeView;
      } catch {
        return {
          ...trade,
          exits: [...trade.exits],
        } satisfies BacktestTradeView;
      }
    });

    return {
      metrics: result.metrics,
      equityCurve: result.equityCurve,
      trades,
      diagnostics: {
        strategyId: "range-reversal",
      },
    };
  },
  estimateValidationRange(candles) {
    return toVolumeProfileRange(candles);
  },
};

const indicatorManifest: StrategyManifest<IndicatorBotConfig> = {
  id: "indicator-bot",
  version: "1",
  label: "Indicator Bot",
  description:
    "Scaffold strategy for future indicator confluence systems. Currently hold-only.",
  resolveConfig(raw) {
    const configured = createConfiguredIndicatorBotStrategy(
      (raw ?? {}) as Partial<IndicatorBotConfig>,
    );
    return configured.config;
  },
  createStrategy(config) {
    return createConfiguredIndicatorBotStrategy(config).strategy;
  },
  runBacktest(input, config) {
    const configured = createConfiguredIndicatorBotStrategy(config);
    const bot = createSyntheticBacktestBotDefinition({
      botId: input.botId,
      symbol: input.symbol,
      strategyId: configured.strategy.id,
      strategyVersion: configured.strategy.version,
      executionTimeframe: input.executionTimeframe,
    });
    const request = {
      id: `${input.botId}-indicator-backtest`,
      botId: input.botId,
      fromMs: input.executionCandles[0]?.time ?? 0,
      toMs:
        input.executionCandles[input.executionCandles.length - 1]?.time ?? 0,
      chartTimeframe: input.executionTimeframe,
      initialEquity: input.initialEquity,
      slippageModel: { type: "none" as const },
      feeModel: { type: "fixed-rate" as const, rate: 0 },
      createdAtMs: Date.now(),
    };

    const result = runBacktestEngine({
      request,
      bot,
      config: configured.config,
      strategy: configured.strategy,
      market: {
        executionCandles: input.executionCandles,
        series: {
          primaryRange: input.primaryRangeCandles,
          secondaryRange: input.secondaryRangeCandles,
        },
      },
      positionSizer: () => ({
        quantity: 1,
      }),
    });

    return {
      metrics: result.metrics,
      equityCurve: result.equityCurve,
      trades: [],
      diagnostics: {
        strategyId: "indicator-bot",
        positions: result.positions.length,
      },
    };
  },
  estimateValidationRange(candles) {
    return toSimpleRange(candles);
  },
};

const manifestById = new Map<string, StrategyManifest>([
  [rangeReversalManifest.id, rangeReversalManifest],
  [indicatorManifest.id, indicatorManifest],
]);

export const strategyRegistry: StrategyRegistry = {
  get(bot) {
    const manifest = this.getManifest(bot.strategyId);
    const config = manifest.resolveConfig(
      (bot.strategyConfig ?? {}) as Record<string, unknown>,
    );

    return {
      manifest,
      config,
      strategy: manifest.createStrategy(config),
    };
  },
  getManifest(strategyId) {
    const manifest = manifestById.get(strategyId);
    if (!manifest) {
      throw new Error(`Unsupported strategy: ${strategyId}`);
    }
    return manifest;
  },
  listManifests() {
    return [...manifestById.values()];
  },
};
