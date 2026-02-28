import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import { getBotExecutionCursor, getMarketFeedState } from "./feed-store";
import { getClosedCandleEndTime, getTimeframeDurationMs } from "./runtime-config";
import { loadActiveBots } from "./runtime-bots";
import { getRuntimeSettings } from "./runtime-settings";
import { strategyRegistry } from "./strategy-registry";

const sqs = new SQSClient({});
const GLOBAL_DISPATCH_MS = 5 * 60_000;

interface ExecutionJobMessage {
  botId: string;
  executionTimeframe: string;
  closedCandleTime: number;
  requiredFeedVersion: string;
}

function getQueueUrl(name: string): string {
  const resources = Resource as unknown as Record<string, { url?: string } | undefined>;
  const url = resources[name]?.url;
  if (typeof url === "string" && url.length > 0) {
    return url;
  }
  throw new Error(`Missing linked Resource.${name}.url`);
}

function canDispatchTimeframe(timeframe: string): boolean {
  const durationMs = getTimeframeDurationMs(timeframe as never);
  return durationMs >= GLOBAL_DISPATCH_MS && durationMs % GLOBAL_DISPATCH_MS === 0;
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

    const closedCandleTime = getClosedCandleEndTime(nowMs, bot.runtime.executionTimeframe);
    const cursor = await getBotExecutionCursor({
      botId: bot.id,
      timeframe: bot.runtime.executionTimeframe,
    });
    if (cursor && cursor.lastProcessedCandleCloseMs >= closedCandleTime) {
      skippedNotDue += 1;
      continue;
    }

    const resolved = strategyRegistry.get(bot);
    const feeds = resolved.manifest.requiredFeeds({ bot, config: resolved.config });
    const feedStates = await Promise.all(
      feeds.candles.map((requirement) =>
        getMarketFeedState({
          exchangeId: bot.exchangeId,
          symbol: bot.symbol,
          timeframe: requirement.timeframe,
        }),
      ),
    );

    const allFresh = feedStates.every((state, index) => {
      if (!state || state.status !== "ready") return false;
      const requirement = feeds.candles[index];
      if (!requirement) return false;
      const requiredClosedTime = getClosedCandleEndTime(nowMs, requirement.timeframe);
      return typeof state.lastClosedCandleTime === "number" && state.lastClosedCandleTime >= requiredClosedTime;
    });

    if (!allFresh) {
      skippedMissingFeeds += 1;
      continue;
    }

    const message: ExecutionJobMessage = {
      botId: bot.id,
      executionTimeframe: bot.runtime.executionTimeframe,
      closedCandleTime,
      requiredFeedVersion: feedStates
        .map((state) => `${state?.timeframe}:${state?.lastClosedCandleTime ?? 0}`)
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
      closedCandleTime,
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
