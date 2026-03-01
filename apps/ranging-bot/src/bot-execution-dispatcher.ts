import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import {
  getBotExecutionCursor,
  getIndicatorFeedState,
  getMarketFeedState,
} from "./feed-store";
import {
  getClosedCandleEndTime,
  getTimeframeDurationMs,
} from "./runtime-config";
import { loadActiveBots } from "./runtime-bots";
import { getRuntimeSettings } from "./runtime-settings";
import { strategyRegistry } from "./strategy-registry";
import { createIndicatorParamsHash } from "@repo/trading-engine";

const sqs = new SQSClient({});
const GLOBAL_DISPATCH_MS = 5 * 60_000;

interface ExecutionJobMessage {
  botId: string;
  executionTimeframe: string;
  closedCandleTime: number;
  requiredFeedVersion: string;
}

function getQueueUrl(name: string): string {
  const resources = Resource as unknown as Record<
    string,
    { url?: string } | undefined
  >;
  const url = resources[name]?.url;
  if (typeof url === "string" && url.length > 0) {
    return url;
  }
  throw new Error(`Missing linked Resource.${name}.url`);
}

function canDispatchTimeframe(timeframe: string): boolean {
  const durationMs = getTimeframeDurationMs(timeframe as never);
  return (
    durationMs >= GLOBAL_DISPATCH_MS && durationMs % GLOBAL_DISPATCH_MS === 0
  );
}

export async function handler() {
  const runtimeSettings = getRuntimeSettings();
  if (!runtimeSettings.sharedFeedExecutionEnabled) {
    return {
      enabled: false,
      queued: 0,
      skippedNotDue: 0,
      skippedMissingFeeds: 0,
      skippedUnsupportedTimeframe: 0,
    };
  }

  const bots = await loadActiveBots();
  const queueUrl = getQueueUrl("RangingBotExecutionQueue");
  const nowMs = Date.now();
  let queued = 0;
  let skippedNotDue = 0;
  let skippedMissingFeeds = 0;
  let skippedUnsupportedTimeframe = 0;

  for (const bot of bots) {
    if (!canDispatchTimeframe(bot.runtime.executionTimeframe)) {
      skippedUnsupportedTimeframe += 1;
      continue;
    }

    const cursor = await getBotExecutionCursor({
      botId: bot.id,
      timeframe: bot.runtime.executionTimeframe,
    });

    const resolved = strategyRegistry.get(bot);
    const feeds = resolved.manifest.requiredFeeds({
      bot,
      config: resolved.config,
    });
    const marketFeedStates = await Promise.all(
      feeds.candles.map((requirement) =>
        getMarketFeedState({
          exchangeId: bot.exchangeId,
          symbol: bot.symbol,
          timeframe: requirement.timeframe,
        }),
      ),
    );
    const indicatorFeedStates = await Promise.all(
      feeds.indicators.map((requirement) =>
        getIndicatorFeedState({
          exchangeId: bot.exchangeId,
          symbol: bot.symbol,
          timeframe: requirement.timeframe,
          indicatorId: requirement.indicatorId,
          paramsHash: createIndicatorParamsHash({
            indicatorId: requirement.indicatorId,
            source: requirement.source,
            params: requirement.params,
          }),
        }),
      ),
    );

    const executionFeed = marketFeedStates.find(
      (state) => state?.timeframe === bot.runtime.executionTimeframe,
    );
    const executionClosedCandleTime =
      executionFeed?.status === "ready"
        ? executionFeed.lastClosedCandleTime
        : 0;
    if (
      !executionClosedCandleTime ||
      !Number.isFinite(executionClosedCandleTime)
    ) {
      skippedMissingFeeds += 1;
      continue;
    }

    if (
      cursor &&
      cursor.lastProcessedCandleCloseMs >= executionClosedCandleTime
    ) {
      skippedNotDue += 1;
      continue;
    }

    const allMarketFeedsFresh = marketFeedStates.every((state, index) => {
      if (!state || state.status !== "ready") return false;
      const requirement = feeds.candles[index];
      if (!requirement) return false;
      const requiredClosedTime = getClosedCandleEndTime(
        executionClosedCandleTime + 1,
        requirement.timeframe,
      );
      return (
        typeof state.lastClosedCandleTime === "number" &&
        state.lastClosedCandleTime >= requiredClosedTime
      );
    });

    const allIndicatorFeedsFresh = indicatorFeedStates.every((state, index) => {
      if (!state || state.status !== "ready") return false;
      const requirement = feeds.indicators[index];
      if (!requirement) return false;
      const requiredClosedTime = getClosedCandleEndTime(
        executionClosedCandleTime + 1,
        requirement.timeframe,
      );
      return (
        typeof state.lastComputedCandleTime === "number" &&
        state.lastComputedCandleTime >= requiredClosedTime
      );
    });

    if (!allMarketFeedsFresh || !allIndicatorFeedsFresh) {
      skippedMissingFeeds += 1;
      continue;
    }

    const message: ExecutionJobMessage = {
      botId: bot.id,
      executionTimeframe: bot.runtime.executionTimeframe,
      closedCandleTime: executionClosedCandleTime,
      requiredFeedVersion: [
        ...marketFeedStates.map(
          (state) => `${state?.timeframe}:${state?.lastClosedCandleTime ?? 0}`,
        ),
        ...indicatorFeedStates.map(
          (state) =>
            `${state?.timeframe}:${state?.indicatorId ?? "unknown"}:${state?.lastComputedCandleTime ?? 0}`,
        ),
      ]
        .sort()
        .join("|"),
    };

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
      }),
    );
    queued += 1;

    console.log("[bot-execution-dispatcher] queued", {
      botId: bot.id,
      symbol: bot.symbol,
      executionTimeframe: bot.runtime.executionTimeframe,
      closedCandleTime: executionClosedCandleTime,
      requiredFeedsFresh: true,
    });
  }

  return {
    enabled: true,
    queued,
    skippedNotDue,
    skippedMissingFeeds,
    skippedUnsupportedTimeframe,
  };
}
