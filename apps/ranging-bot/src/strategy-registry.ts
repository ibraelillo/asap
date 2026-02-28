import {
  computeVolumeProfileLevels,
  createConfig as createRangeReversalConfig,
  createConfiguredRangeReversalStrategy,
  rangeReversalConfigJsonSchema,
  rangeReversalConfigUi,
  type BacktestCandle,
  type DeepPartial,
  type RangeReversalConfig,
} from "@repo/ranging-core";
import {
  createConfiguredIndicatorBotStrategy,
  indicatorBotConfigJsonSchema,
  indicatorBotConfigUi,
  type IndicatorBotConfig,
} from "@repo/indicator-bot-core";
import {
  type BacktestMetrics,
  type Candle,
  type EquityPoint,
  type StrategyConfigJsonSchema,
  type StrategyConfigUiField,
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
  configJsonSchema: StrategyConfigJsonSchema;
  configUi: StrategyConfigUiField[];
  getDefaultConfig(): TConfig;
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
  configJsonSchema: rangeReversalConfigJsonSchema,
  configUi: rangeReversalConfigUi,
  getDefaultConfig() {
    return createRangeReversalConfig();
  },
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
    "Low-frequency indicator confluence strategy using EMA trend, RSI pullback, ATR risk, and higher-timeframe confirmation.",
  configJsonSchema: indicatorBotConfigJsonSchema,
  configUi: indicatorBotConfigUi,
  getDefaultConfig() {
    return createConfiguredIndicatorBotStrategy().config;
  },
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
    const result = createConfiguredIndicatorBotStrategy(config).runBacktest(
      input,
      config,
    );

    return {
      metrics: result.result.metrics,
      equityCurve: result.result.equityCurve,
      trades: result.trades,
      diagnostics: {
        strategyId: "indicator-bot",
        positions: result.result.positions.length,
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
