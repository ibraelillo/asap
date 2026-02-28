import { createIndicatorParamsHash, type IndicatorFeedRequirement, type StrategyFeedRequirements } from "@repo/trading-engine";
import { getTimeframeDurationMs, getClosedCandleEndTime } from "./runtime-config";
import { loadActiveBots } from "./runtime-bots";
import { strategyRegistry } from "./strategy-registry";
import { getIndicatorFeedState, getMarketFeedState, putIndicatorFeedState, putMarketFeedState } from "./feed-store";
import type { BotRecord, FeedRegistrySnapshot, IndicatorFeedState, MarketFeedState } from "./monitoring/types";

const GLOBAL_DISPATCH_MS = 5 * 60_000;

export interface DueMarketFeedRefresh {
  exchangeId: string;
  symbol: string;
  timeframe: BotRecord["runtime"]["executionTimeframe"];
  lookbackBars: number;
  requiredAt: number;
  reason: string;
}

function marketFeedKey(input: { exchangeId: string; symbol: string; timeframe: string }): string {
  return `${input.exchangeId}::${input.symbol}::${input.timeframe}`;
}

function indicatorFeedKey(input: {
  exchangeId: string;
  symbol: string;
  timeframe: string;
  indicatorId: string;
  paramsHash: string;
}): string {
  return `${input.exchangeId}::${input.symbol}::${input.timeframe}::${input.indicatorId}::${input.paramsHash}`;
}

function canDispatchTimeframe(timeframe: BotRecord["runtime"]["executionTimeframe"]): boolean {
  const durationMs = getTimeframeDurationMs(timeframe);
  return durationMs >= GLOBAL_DISPATCH_MS && durationMs % GLOBAL_DISPATCH_MS === 0;
}

function aggregateBotRequirements(bot: BotRecord, requirements: StrategyFeedRequirements) {
  const market = new Map<string, MarketFeedState>();
  const indicators = new Map<string, IndicatorFeedState>();

  for (const requirement of requirements.candles) {
    const key = marketFeedKey({
      exchangeId: bot.exchangeId,
      symbol: bot.symbol,
      timeframe: requirement.timeframe,
    });
    const existing = market.get(key);
    if (existing) {
      existing.requiredByCount += 1;
      existing.maxLookbackBars = Math.max(existing.maxLookbackBars, requirement.lookbackBars);
      existing.requirement = {
        role: "shared",
        timeframe: requirement.timeframe,
        lookbackBars: Math.max(existing.requirement.lookbackBars, requirement.lookbackBars),
      };
      continue;
    }

    market.set(key, {
      exchangeId: bot.exchangeId,
      symbol: bot.symbol,
      timeframe: requirement.timeframe,
      requiredByCount: 1,
      maxLookbackBars: requirement.lookbackBars,
      nextDueAt: 0,
      status: "stale",
      requirement: {
        role: "shared",
        timeframe: requirement.timeframe,
        lookbackBars: requirement.lookbackBars,
      },
    });
  }

  for (const requirement of requirements.indicators) {
    const paramsHash = createIndicatorParamsHash({
      indicatorId: requirement.indicatorId,
      source: requirement.source,
      params: requirement.params,
    });
    const key = indicatorFeedKey({
      exchangeId: bot.exchangeId,
      symbol: bot.symbol,
      timeframe: requirement.timeframe,
      indicatorId: requirement.indicatorId,
      paramsHash,
    });
    const existing = indicators.get(key);
    if (existing) {
      existing.requiredByCount += 1;
      existing.maxLookbackBars = Math.max(existing.maxLookbackBars, requirement.lookbackBars);
      existing.requirement = {
        ...existing.requirement,
        lookbackBars: Math.max(existing.requirement.lookbackBars, requirement.lookbackBars),
      };
      continue;
    }

    indicators.set(key, {
      exchangeId: bot.exchangeId,
      symbol: bot.symbol,
      timeframe: requirement.timeframe,
      indicatorId: requirement.indicatorId,
      params: requirement.params,
      paramsHash,
      requiredByCount: 1,
      maxLookbackBars: requirement.lookbackBars,
      status: "pending",
      requirement: {
        ...requirement,
        role: "shared",
      },
    });
  }

  return {
    market: [...market.values()],
    indicators: [...indicators.values()],
  };
}

export async function buildFeedRegistrySnapshot(nowMs = Date.now()): Promise<{
  snapshot: FeedRegistrySnapshot;
  dueMarketFeeds: DueMarketFeedRefresh[];
}> {
  const bots = await loadActiveBots();
  const aggregatedMarket = new Map<string, MarketFeedState>();
  const aggregatedIndicators = new Map<string, IndicatorFeedState>();

  for (const bot of bots) {
    const resolved = strategyRegistry.get(bot);
    const requirements = resolved.manifest.requiredFeeds({
      bot,
      config: resolved.config,
    });
    const { market, indicators } = aggregateBotRequirements(bot, requirements);

    for (const state of market) {
      const key = marketFeedKey(state);
      const existing = aggregatedMarket.get(key);
      if (existing) {
        existing.requiredByCount += state.requiredByCount;
        existing.maxLookbackBars = Math.max(existing.maxLookbackBars, state.maxLookbackBars);
        existing.requirement.lookbackBars = Math.max(existing.requirement.lookbackBars, state.requirement.lookbackBars);
      } else {
        aggregatedMarket.set(key, state);
      }
    }

    for (const state of indicators) {
      const key = indicatorFeedKey(state);
      const existing = aggregatedIndicators.get(key);
      if (existing) {
        existing.requiredByCount += state.requiredByCount;
        existing.maxLookbackBars = Math.max(existing.maxLookbackBars, state.maxLookbackBars);
        existing.requirement.lookbackBars = Math.max(existing.requirement.lookbackBars, state.requirement.lookbackBars);
      } else {
        aggregatedIndicators.set(key, state);
      }
    }
  }

  const dueMarketFeeds: DueMarketFeedRefresh[] = [];
  const marketFeeds = await Promise.all(
    [...aggregatedMarket.values()].map(async (state) => {
      const existing = await getMarketFeedState(state);
      const expectedClosedCandleTime = getClosedCandleEndTime(nowMs, state.timeframe);
      const durationMs = getTimeframeDurationMs(state.timeframe);
      const isFresh =
        existing?.status === "ready" &&
        typeof existing.lastClosedCandleTime === "number" &&
        existing.lastClosedCandleTime >= expectedClosedCandleTime &&
        typeof existing.storageKey === "string" &&
        existing.storageKey.length > 0;

      const nextState: MarketFeedState = {
        ...state,
        lastClosedCandleTime: existing?.lastClosedCandleTime,
        lastRefreshedAt: existing?.lastRefreshedAt,
        nextDueAt: expectedClosedCandleTime + durationMs,
        status: isFresh
          ? "ready"
          : existing?.status === "refreshing"
            ? "refreshing"
            : existing?.status === "error"
              ? "error"
              : "stale",
        storageKey: existing?.storageKey,
        candleCount: existing?.candleCount,
        errorMessage: existing?.errorMessage,
      };

      await putMarketFeedState(nextState);

      if (
        canDispatchTimeframe(state.timeframe) &&
        expectedClosedCandleTime > 0 &&
        (!existing ||
          existing.lastClosedCandleTime !== expectedClosedCandleTime) &&
        nextState.status !== "refreshing"
      ) {
        dueMarketFeeds.push({
          exchangeId: state.exchangeId,
          symbol: state.symbol,
          timeframe: state.timeframe,
          lookbackBars: state.maxLookbackBars,
          requiredAt: expectedClosedCandleTime,
          reason: existing ? "stale_or_missing_refresh" : "new_requirement",
        });
      }

      return nextState;
    }),
  );

  const indicatorFeeds = await Promise.all(
    [...aggregatedIndicators.values()].map(async (state) => {
      const existing = await getIndicatorFeedState(state);
      const upstream = marketFeeds.find(
        (market) =>
          market.exchangeId === state.exchangeId &&
          market.symbol === state.symbol &&
          market.timeframe === state.timeframe,
      );
      const expectedClosedCandleTime = getClosedCandleEndTime(nowMs, state.timeframe);
      const upstreamFresh =
        upstream?.status === "ready" &&
        typeof upstream.lastClosedCandleTime === "number" &&
        upstream.lastClosedCandleTime >= expectedClosedCandleTime;
      const indicatorFresh =
        existing?.status === "ready" &&
        typeof existing.lastComputedCandleTime === "number" &&
        existing.lastComputedCandleTime >= expectedClosedCandleTime;

      const nextState: IndicatorFeedState = {
        ...state,
        lastComputedCandleTime: existing?.lastComputedCandleTime,
        lastComputedAt: existing?.lastComputedAt,
        storageKey: existing?.storageKey,
        errorMessage: existing?.errorMessage,
        status: indicatorFresh ? "ready" : upstreamFresh ? "pending" : "stale",
      };

      await putIndicatorFeedState(nextState);
      return nextState;
    }),
  );

  return {
    snapshot: {
      generatedAt: new Date(nowMs).toISOString(),
      marketFeeds,
      indicatorFeeds,
    },
    dueMarketFeeds,
  };
}
