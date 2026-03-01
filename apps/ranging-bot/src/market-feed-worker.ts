import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import type { SQSEvent } from "aws-lambda";
import { exchangeAdapterRegistry } from "./exchange-adapter-registry";
import {
  getMarketFeedState,
  listIndicatorFeedStatesForTimeframe,
  putMarketFeedState,
} from "./feed-store";
import { getRuntimeSettings } from "./runtime-settings";
import { saveMarketFeedSnapshot } from "./shared-market-snapshots";
import { getTimeframeDurationMs } from "./runtime-config";
import type { MarketFeedState } from "./monitoring/types";
import { publishFeedUpdate } from "./monitoring/realtime";

const sqs = new SQSClient({});

interface MarketFeedRefreshMessage {
  exchangeId: string;
  symbol: string;
  timeframe: MarketFeedState["timeframe"];
  lookbackBars: number;
  requiredAt: number;
  reason: string;
}

function asMessage(body: string): MarketFeedRefreshMessage | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (
      typeof parsed.exchangeId !== "string" ||
      typeof parsed.symbol !== "string" ||
      typeof parsed.timeframe !== "string" ||
      !Number.isFinite(Number(parsed.lookbackBars)) ||
      !Number.isFinite(Number(parsed.requiredAt)) ||
      typeof parsed.reason !== "string"
    ) {
      return null;
    }

    return {
      exchangeId: parsed.exchangeId,
      symbol: parsed.symbol,
      timeframe: parsed.timeframe as MarketFeedState["timeframe"],
      lookbackBars: Math.max(1, Math.floor(Number(parsed.lookbackBars))),
      requiredAt: Math.floor(Number(parsed.requiredAt)),
      reason: parsed.reason,
    };
  } catch {
    return null;
  }
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

async function markRefreshing(message: MarketFeedRefreshMessage) {
  const existing = await getMarketFeedState(message);
  const nextState: MarketFeedState = {
    exchangeId: message.exchangeId,
    symbol: message.symbol,
    timeframe: message.timeframe,
    requiredByCount: existing?.requiredByCount ?? 0,
    maxLookbackBars: Math.max(
      existing?.maxLookbackBars ?? 0,
      message.lookbackBars,
    ),
    lastClosedCandleTime: existing?.lastClosedCandleTime,
    lastRefreshedAt: existing?.lastRefreshedAt,
    nextDueAt: message.requiredAt + getTimeframeDurationMs(message.timeframe),
    status: "refreshing",
    storageKey: existing?.storageKey,
    candleCount: existing?.candleCount,
    errorMessage: undefined,
    requirement: existing?.requirement ?? {
      role: "shared",
      timeframe: message.timeframe,
      lookbackBars: message.lookbackBars,
    },
  };
  await putMarketFeedState(nextState);
}

export async function handler(event: SQSEvent) {
  const runtimeSettings = getRuntimeSettings();
  if (!runtimeSettings.sharedFeedExecutionEnabled) {
    return { enabled: false, processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const record of event.Records) {
    const message = asMessage(record.body);
    if (!message) {
      failed += 1;
      continue;
    }

    try {
      await markRefreshing(message);
      const publicAdapter = exchangeAdapterRegistry.getPublic(
        message.exchangeId,
      );
      const provider = publicAdapter.createKlineProvider({
        exchangeId: message.exchangeId,
        nowMs: Date.now(),
        metadata: {
          symbol: message.symbol,
          source: "market-feed-worker",
          reason: message.reason,
        },
      });
      const candles = await provider.fetchKlines({
        symbol: message.symbol,
        timeframe: message.timeframe,
        limit: message.lookbackBars,
        endTimeMs: message.requiredAt,
      });
      const snapshot = await saveMarketFeedSnapshot({
        exchangeId: message.exchangeId,
        symbol: message.symbol,
        timeframe: message.timeframe,
        candles,
        lastClosedCandleTime: candles.at(-1)?.time ?? message.requiredAt,
      });

      const existing = await getMarketFeedState(message);
      await putMarketFeedState({
        exchangeId: message.exchangeId,
        symbol: message.symbol,
        timeframe: message.timeframe,
        requiredByCount: existing?.requiredByCount ?? 0,
        maxLookbackBars: Math.max(
          existing?.maxLookbackBars ?? 0,
          message.lookbackBars,
        ),
        lastClosedCandleTime: snapshot.lastClosedCandleTime,
        lastRefreshedAt: Date.now(),
        nextDueAt:
          message.requiredAt + getTimeframeDurationMs(message.timeframe),
        status: "ready",
        storageKey: snapshot.storageKey,
        candleCount: snapshot.candles.length,
        errorMessage: undefined,
        requirement: existing?.requirement ?? {
          role: "shared",
          timeframe: message.timeframe,
          lookbackBars: message.lookbackBars,
        },
      });
      await publishFeedUpdate({
        kind: "market",
        exchangeId: message.exchangeId,
        symbol: message.symbol,
        timeframe: message.timeframe,
        status: "ready",
        updatedAt: Date.now(),
      });
      const indicatorQueueUrl = getQueueUrl("RangingIndicatorRefreshQueue");
      const dependentIndicators = await listIndicatorFeedStatesForTimeframe({
        exchangeId: message.exchangeId,
        symbol: message.symbol,
        timeframe: message.timeframe,
      });
      for (const indicator of dependentIndicators) {
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: indicatorQueueUrl,
            MessageBody: JSON.stringify({
              exchangeId: indicator.exchangeId,
              symbol: indicator.symbol,
              timeframe: indicator.timeframe,
              indicatorId: indicator.indicatorId,
              paramsHash: indicator.paramsHash,
              requiredAt: snapshot.lastClosedCandleTime,
              reason: "upstream_market_feed_refreshed",
            }),
          }),
        );
      }
      processed += 1;
      console.log("[market-feed-worker] refreshed", {
        exchangeId: message.exchangeId,
        symbol: message.symbol,
        timeframe: message.timeframe,
        lookbackBars: message.lookbackBars,
        lastClosedCandleTime: snapshot.lastClosedCandleTime,
        candleCount: snapshot.candles.length,
        status: "ready",
      });
    } catch (error) {
      failed += 1;
      const existing = await getMarketFeedState(message);
      await putMarketFeedState({
        exchangeId: message.exchangeId,
        symbol: message.symbol,
        timeframe: message.timeframe,
        requiredByCount: existing?.requiredByCount ?? 0,
        maxLookbackBars: Math.max(
          existing?.maxLookbackBars ?? 0,
          message.lookbackBars,
        ),
        lastClosedCandleTime: existing?.lastClosedCandleTime,
        lastRefreshedAt: Date.now(),
        nextDueAt:
          message.requiredAt + getTimeframeDurationMs(message.timeframe),
        status: "error",
        storageKey: existing?.storageKey,
        candleCount: existing?.candleCount,
        errorMessage: error instanceof Error ? error.message : String(error),
        requirement: existing?.requirement ?? {
          role: "shared",
          timeframe: message.timeframe,
          lookbackBars: message.lookbackBars,
        },
      });
      await publishFeedUpdate({
        kind: "market",
        exchangeId: message.exchangeId,
        symbol: message.symbol,
        timeframe: message.timeframe,
        status: "error",
        updatedAt: Date.now(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      console.error("[market-feed-worker] refresh failed", {
        exchangeId: message.exchangeId,
        symbol: message.symbol,
        timeframe: message.timeframe,
        lookbackBars: message.lookbackBars,
        requiredAt: message.requiredAt,
        status: "error",
        error,
      });
      throw error;
    }
  }

  return { enabled: true, processed, failed };
}
