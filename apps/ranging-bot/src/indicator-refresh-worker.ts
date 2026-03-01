import type { SQSEvent } from "aws-lambda";
import { createIndicatorParamsHash } from "@repo/trading-engine";
import { getIndicatorFeedState, putIndicatorFeedState } from "./feed-store";
import { computeIndicatorFeed } from "./indicator-feed-compute";
import { getRuntimeSettings } from "./runtime-settings";
import { loadLatestMarketFeedSnapshot } from "./shared-market-snapshots";
import {
  saveIndicatorFeedSnapshot,
  loadLatestIndicatorFeedSnapshot,
} from "./shared-indicator-snapshots";

interface IndicatorRefreshMessage {
  exchangeId: string;
  symbol: string;
  timeframe: string;
  indicatorId: string;
  paramsHash: string;
  requiredAt: number;
  reason: string;
}

function asMessage(body: string): IndicatorRefreshMessage | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (
      typeof parsed.exchangeId !== "string" ||
      typeof parsed.symbol !== "string" ||
      typeof parsed.timeframe !== "string" ||
      typeof parsed.indicatorId !== "string" ||
      typeof parsed.paramsHash !== "string" ||
      !Number.isFinite(Number(parsed.requiredAt)) ||
      typeof parsed.reason !== "string"
    ) {
      return null;
    }

    return {
      exchangeId: parsed.exchangeId,
      symbol: parsed.symbol,
      timeframe: parsed.timeframe,
      indicatorId: parsed.indicatorId,
      paramsHash: parsed.paramsHash,
      requiredAt: Math.floor(Number(parsed.requiredAt)),
      reason: parsed.reason,
    };
  } catch {
    return null;
  }
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

    const existing = await getIndicatorFeedState(message);
    if (!existing) {
      failed += 1;
      continue;
    }

    try {
      const marketSnapshot = await loadLatestMarketFeedSnapshot({
        exchangeId: message.exchangeId,
        symbol: message.symbol,
        timeframe: message.timeframe as never,
      });
      if (!marketSnapshot) {
        throw new Error("Missing market snapshot for indicator refresh");
      }

      const computedHash = createIndicatorParamsHash({
        indicatorId: existing.indicatorId,
        source: existing.requirement.source,
        params: existing.params,
      });
      if (computedHash !== existing.paramsHash) {
        throw new Error("Indicator params hash mismatch");
      }

      const outputs = computeIndicatorFeed(
        marketSnapshot.candles,
        existing.requirement,
      );
      const snapshot = await saveIndicatorFeedSnapshot({
        exchangeId: existing.exchangeId,
        symbol: existing.symbol,
        timeframe: existing.timeframe,
        indicatorId: existing.indicatorId,
        paramsHash: existing.paramsHash,
        times: marketSnapshot.candles.map((candle) => candle.time),
        outputs,
        lastComputedCandleTime:
          marketSnapshot.lastClosedCandleTime ?? marketSnapshot.toMs,
      });

      await putIndicatorFeedState({
        ...existing,
        status: "ready",
        storageKey: snapshot.storageKey,
        lastComputedAt: Date.now(),
        lastComputedCandleTime: snapshot.lastComputedCandleTime,
        errorMessage: undefined,
      });
      processed += 1;

      console.log("[indicator-refresh-worker] refreshed", {
        exchangeId: existing.exchangeId,
        symbol: existing.symbol,
        timeframe: existing.timeframe,
        indicatorId: existing.indicatorId,
        paramsHash: existing.paramsHash,
        lastComputedCandleTime: snapshot.lastComputedCandleTime,
        status: "ready",
      });
    } catch (error) {
      const maybeSnapshot = await loadLatestIndicatorFeedSnapshot({
        exchangeId: existing.exchangeId,
        symbol: existing.symbol,
        timeframe: existing.timeframe,
        indicatorId: existing.indicatorId,
        paramsHash: existing.paramsHash,
      });
      await putIndicatorFeedState({
        ...existing,
        status: "error",
        storageKey: maybeSnapshot ? existing.storageKey : existing.storageKey,
        lastComputedAt: Date.now(),
        lastComputedCandleTime:
          maybeSnapshot?.lastComputedCandleTime ??
          existing.lastComputedCandleTime,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      failed += 1;
      console.error("[indicator-refresh-worker] refresh failed", {
        exchangeId: existing.exchangeId,
        symbol: existing.symbol,
        timeframe: existing.timeframe,
        indicatorId: existing.indicatorId,
        paramsHash: existing.paramsHash,
        requiredAt: message.requiredAt,
        error,
      });
      throw error;
    }
  }

  return { enabled: true, processed, failed };
}
