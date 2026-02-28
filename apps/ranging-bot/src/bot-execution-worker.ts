import type { SQSEvent } from "aws-lambda";
import { exchangeAdapterRegistry } from "./exchange-adapter-registry";
import { advanceBotExecutionCursor, getBotExecutionCursor } from "./feed-store";
import { buildExecutionContext, getGlobalExecutionDefaults, persistRunOutcome, toFailedRunRecord, toPositionState, toRunInput, toRunRecord } from "./bot-run-runtime";
import { getLatestOpenPositionByBot, getBotRecordById } from "./monitoring/store";
import { loadLatestMarketFeedSnapshot } from "./shared-market-snapshots";
import { SharedFeedBackedKlineProvider } from "./shared-kline-provider";
import { getClosedCandleEndTime } from "./runtime-config";
import { getRuntimeSettings } from "./runtime-settings";
import { strategyRegistry } from "./strategy-registry";
import { createBotRuntime } from "./runtime-orchestrator-factory";

interface ExecutionJobMessage {
  botId: string;
  executionTimeframe: string;
  closedCandleTime: number;
  requiredFeedVersion: string;
}

function asMessage(body: string): ExecutionJobMessage | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (
      typeof parsed.botId !== "string" ||
      typeof parsed.executionTimeframe !== "string" ||
      !Number.isFinite(Number(parsed.closedCandleTime)) ||
      typeof parsed.requiredFeedVersion !== "string"
    ) {
      return null;
    }
    return {
      botId: parsed.botId,
      executionTimeframe: parsed.executionTimeframe,
      closedCandleTime: Math.floor(Number(parsed.closedCandleTime)),
      requiredFeedVersion: parsed.requiredFeedVersion,
    };
  } catch {
    return null;
  }
}

export async function handler(event: SQSEvent) {
  const runtimeSettings = getRuntimeSettings();
  if (!runtimeSettings.sharedFeedExecutionEnabled) {
    return { enabled: false, processed: 0, failed: 0, skipped: 0 };
  }

  const defaults = getGlobalExecutionDefaults();
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const record of event.Records) {
    const message = asMessage(record.body);
    if (!message) {
      skipped += 1;
      continue;
    }

    const bot = await getBotRecordById(message.botId);
    if (!bot || bot.status !== "active") {
      skipped += 1;
      continue;
    }

    const cursor = await getBotExecutionCursor({
      botId: bot.id,
      timeframe: bot.runtime.executionTimeframe,
    });
    if (cursor && cursor.lastProcessedCandleCloseMs >= message.closedCandleTime) {
      skipped += 1;
      continue;
    }

    const runInput = toRunInput(bot, message.closedCandleTime);
    const positionBefore = await getLatestOpenPositionByBot(bot.id);

    try {
      const resolved = strategyRegistry.get(bot);
      const requiredFeeds = resolved.manifest.requiredFeeds({ bot, config: resolved.config });
      const snapshots = await Promise.all(
        requiredFeeds.candles.map((requirement) =>
          loadLatestMarketFeedSnapshot({
            exchangeId: bot.exchangeId,
            symbol: bot.symbol,
            timeframe: requirement.timeframe,
          }),
        ),
      );

      const allFresh = snapshots.every((snapshot, index) => {
        const requirement = requiredFeeds.candles[index];
        if (!snapshot || !requirement) return false;
        const requiredClosed = getClosedCandleEndTime(
          message.closedCandleTime + 1,
          requirement.timeframe,
        );
        return snapshot.lastClosedCandleTime >= requiredClosed;
      });

      if (!allFresh) {
        skipped += 1;
        console.warn("[bot-execution-worker] skipped due stale shared feeds", {
          botId: bot.id,
          symbol: bot.symbol,
          executionTimeframe: bot.runtime.executionTimeframe,
          closedCandleTime: message.closedCandleTime,
        });
        continue;
      }

      const executionContext = await buildExecutionContext(bot, defaults.dryRun);
      const publicAdapter = exchangeAdapterRegistry.getPublic(bot.exchangeId);
      const privateAdapter = exchangeAdapterRegistry.getPrivate(bot.exchangeId);
      const sharedKlineProvider = new SharedFeedBackedKlineProvider(
        snapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot)),
      );
      const runtime = createBotRuntime({
        bot,
        marketDataAdapter: publicAdapter,
        executionAdapter: privateAdapter,
        executionContext,
        klineProviderOverride: sharedKlineProvider,
        signalProcessorOptions: {
          dryRun: executionContext.dryRun,
          marginMode: bot.runtime.marginMode ?? defaults.marginMode,
          valueQty: bot.runtime.valueQty ?? defaults.valueQty,
        },
      });

      const strategyEvent = await runtime.runOnce(
        runInput,
        toPositionState(positionBefore ?? null),
      );
      const runRecord = toRunRecord(bot, runInput, positionBefore ?? null, strategyEvent);
      await persistRunOutcome(bot, positionBefore ?? null, runRecord);
      await advanceBotExecutionCursor({
        botId: bot.id,
        timeframe: bot.runtime.executionTimeframe,
        closedCandleTime: message.closedCandleTime,
      });
      processed += 1;

      console.log("[bot-execution-worker] completed", {
        botId: bot.id,
        symbol: bot.symbol,
        executionTimeframe: bot.runtime.executionTimeframe,
        closedCandleTime: message.closedCandleTime,
        requiredFeedVersion: message.requiredFeedVersion,
        processingStatus: strategyEvent.processing?.status,
      });
    } catch (error) {
      failed += 1;
      const failedRecord = toFailedRunRecord(bot, runInput, error);
      await persistRunOutcome(bot, positionBefore ?? null, failedRecord);
      console.error("[bot-execution-worker] failed", {
        botId: bot.id,
        symbol: bot.symbol,
        executionTimeframe: bot.runtime.executionTimeframe,
        closedCandleTime: message.closedCandleTime,
        error,
      });
      throw error;
    }
  }

  return { enabled: true, processed, failed, skipped };
}
