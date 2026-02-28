import type {
  ExecutionContext,
  PositionState,
  StrategySignalEvent,
} from "@repo/trading-engine";
import { runtimeAccountResolver } from "./account-resolver";
import type { OrchestratorRunInput } from "./contracts";
import { exchangeAdapterRegistry } from "./exchange-adapter-registry";
import { publishRunRecord, publishTickSummary } from "./monitoring/realtime";
import {
  advanceProcessingCursor,
  getLatestOpenPositionByBot,
  getProcessingCursor,
  putFillRecord,
  putOrderRecord,
  putPositionRecord,
  putReconciliationEventRecord,
  putRunRecord,
} from "./monitoring/store";
import type {
  AccountRecord,
  BotRecord,
  BotRunRecord,
  PositionRecord,
} from "./monitoring/types";
import {
  buildFillRecords,
  buildOrderRecord,
  buildReconciliationEventRecord,
  reconcilePositionRecord,
} from "./execution-ledger";
import { createBotRuntime } from "./runtime-orchestrator-factory";
import { loadActiveBots } from "./runtime-bots";
import {
  getClosedCandleEndTime,
  getTimeframeDurationMs,
  toBoolean,
} from "./runtime-config";
const HOURLY_DISPATCH_MS = 60 * 60_000;

interface CronTickEvent {
  trigger?: string;
  symbols?: string;
  botsJson?: string;
  dryRun?: string;
  marginMode?: "CROSS" | "ISOLATED" | string;
  valueQty?: string;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return {};
}

function parseSymbols(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (symbol): symbol is string =>
        typeof symbol === "string" && symbol.length > 0,
    );
  } catch {
    return raw
      .split(",")
      .map((symbol) => symbol.trim())
      .filter((symbol) => symbol.length > 0);
  }
}

async function buildExecutionContext(
  bot: BotRecord,
  globalDryRun: boolean,
): Promise<ExecutionContext<AccountRecord>> {
  const account = await runtimeAccountResolver.requireAccount(
    bot.accountId,
    bot.exchangeId,
  );

  return {
    bot,
    account,
    exchangeId: bot.exchangeId,
    nowMs: Date.now(),
    dryRun: bot.runtime.dryRun ?? globalDryRun,
    metadata: {
      accountSource: account.metadata?.source ?? "store",
    },
  };
}

function toRunInput(
  bot: BotRecord,
  closedExecutionCandleEndTimeMs: number,
): Omit<OrchestratorRunInput, "bot"> {
  return {
    executionTimeframe: bot.runtime.executionTimeframe,
    primaryRangeTimeframe: bot.runtime.primaryRangeTimeframe,
    secondaryRangeTimeframe: bot.runtime.secondaryRangeTimeframe,
    executionLimit: bot.runtime.executionLimit,
    primaryRangeLimit: bot.runtime.primaryRangeLimit,
    secondaryRangeLimit: bot.runtime.secondaryRangeLimit,
    endTimeMs: closedExecutionCandleEndTimeMs,
  };
}

function isExecutionTimeframeCompatibleForHourlyDispatch(
  bot: BotRecord,
): boolean {
  const durationMs = getTimeframeDurationMs(bot.runtime.executionTimeframe);
  return (
    durationMs >= HOURLY_DISPATCH_MS && durationMs % HOURLY_DISPATCH_MS === 0
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function extractEntrySide(decision: {
  intents: Array<{ kind: string; side?: "long" | "short" }>;
}): "long" | "short" | null {
  const enterIntent = decision.intents.find(
    (intent) => intent.kind === "enter",
  );
  return enterIntent?.side ?? null;
}

function toRunRecord(
  bot: BotRecord,
  runInput: Omit<OrchestratorRunInput, "bot">,
  positionBefore: PositionRecord | null,
  event: StrategySignalEvent,
): BotRunRecord {
  const processing = event.processing ?? {
    status: extractEntrySide(event.decision) ? "error" : "no-signal",
    side: extractEntrySide(event.decision) ?? undefined,
    message: "Missing processing result",
  };

  const snapshot = event.snapshot as {
    price?: number;
    range?: {
      effective?: { val?: number; vah?: number; poc?: number };
      isAligned?: boolean;
      overlapRatio?: number;
    };
    bullishDivergence?: boolean;
    bearishDivergence?: boolean;
    bullishSfp?: boolean;
    bearishSfp?: boolean;
    moneyFlowSlope?: number;
  };
  const order = processing.order;
  const positionStatusAfter = processing.positionSnapshot?.isOpen
    ? order?.purpose === "reduce"
      ? "reducing"
      : order?.purpose === "close"
        ? "closing"
        : "open"
    : order?.purpose === "entry"
      ? order.status === "rejected"
        ? "error"
        : order.status === "filled"
          ? "open"
          : "entry-pending"
      : order?.purpose === "close"
        ? order.status === "rejected"
          ? "error"
          : order.status === "filled"
            ? "closed"
            : "closing"
        : processing.reconciliation?.status === "drift"
          ? "reconciling"
          : processing.reconciliation?.status === "error"
            ? "error"
            : positionBefore?.status;

  return {
    id: `${bot.id}-${event.generatedAtMs}`,
    botId: bot.id,
    botName: bot.name,
    strategyId: bot.strategyId,
    strategyVersion: bot.strategyVersion,
    exchangeId: bot.exchangeId,
    accountId: bot.accountId,
    symbol: bot.symbol,
    generatedAtMs: event.generatedAtMs,
    recordedAtMs: Date.now(),
    runStatus: processing.status === "error" ? "failed" : "ok",
    executionTimeframe: runInput.executionTimeframe,
    primaryRangeTimeframe: runInput.primaryRangeTimeframe,
    secondaryRangeTimeframe: runInput.secondaryRangeTimeframe,
    signal: extractEntrySide(event.decision),
    reasons: event.decision.reasons,
    price: snapshot.price,
    rangeVal: snapshot.range?.effective?.val,
    rangeVah: snapshot.range?.effective?.vah,
    rangePoc: snapshot.range?.effective?.poc,
    rangeIsAligned: snapshot.range?.isAligned,
    rangeOverlapRatio: snapshot.range?.overlapRatio,
    bullishDivergence: snapshot.bullishDivergence,
    bearishDivergence: snapshot.bearishDivergence,
    bullishSfp: snapshot.bullishSfp,
    bearishSfp: snapshot.bearishSfp,
    moneyFlowSlope: snapshot.moneyFlowSlope,
    positionStatusBefore: positionBefore?.status,
    positionStatusAfter,
    exchangeReconciliationStatus: processing.positionSnapshot
      ? "ok"
      : processing.reconciliation?.status,
    processing,
  };
}

function toFailedRunRecord(
  bot: BotRecord,
  runInput: Omit<OrchestratorRunInput, "bot">,
  error: unknown,
): BotRunRecord {
  const message = toErrorMessage(error);
  const recordedAtMs = Date.now();

  return {
    id: `${bot.id}-${recordedAtMs}`,
    botId: bot.id,
    botName: bot.name,
    strategyId: bot.strategyId,
    strategyVersion: bot.strategyVersion,
    exchangeId: bot.exchangeId,
    accountId: bot.accountId,
    symbol: bot.symbol,
    generatedAtMs: recordedAtMs,
    recordedAtMs,
    runStatus: "failed",
    executionTimeframe: runInput.executionTimeframe,
    primaryRangeTimeframe: runInput.primaryRangeTimeframe,
    secondaryRangeTimeframe: runInput.secondaryRangeTimeframe,
    signal: null,
    reasons: ["run_failed"],
    processing: {
      status: "error",
      message,
    },
    errorMessage: message,
  };
}

function toPositionState(record: PositionRecord | null): PositionState | null {
  if (!record) return null;
  return {
    botId: record.botId,
    positionId: record.id,
    symbol: record.symbol,
    side: record.side,
    status: record.status,
    quantity: record.quantity,
    remainingQuantity: record.remainingQuantity,
    avgEntryPrice: record.avgEntryPrice,
    stopPrice: record.stopPrice,
    realizedPnl: record.realizedPnl,
    unrealizedPnl: record.unrealizedPnl,
    openedAtMs: record.openedAtMs,
    closedAtMs: record.closedAtMs,
    strategyContext: record.strategyContext,
  };
}

async function persistAndBroadcast(record: BotRunRecord): Promise<void> {
  await Promise.allSettled([putRunRecord(record), publishRunRecord(record)]);
}

export const handler = async (incomingEvent?: CronTickEvent) => {
  const nowMs = Date.now();
  const event = asObject(incomingEvent);

  const eventSymbols = parseSymbols(event.symbols);
  const rawBotsJson =
    typeof event.botsJson === "string"
      ? event.botsJson
      : process.env.RANGING_BOTS_JSON;
  let bots = await loadActiveBots(rawBotsJson);
  if (eventSymbols.length > 0) {
    const allowedSymbols = new Set(eventSymbols);
    bots = bots.filter((bot) => allowedSymbols.has(bot.symbol));
  }

  const envDryRun = toBoolean(process.env.RANGING_DRY_RUN, true);
  const globalDryRun =
    typeof event.dryRun === "string"
      ? toBoolean(event.dryRun, envDryRun)
      : envDryRun;

  const envMarginMode =
    process.env.RANGING_MARGIN_MODE === "ISOLATED" ? "ISOLATED" : "CROSS";
  const globalMarginMode =
    event.marginMode === "ISOLATED" || event.marginMode === "CROSS"
      ? event.marginMode
      : envMarginMode;
  const globalValueQty =
    typeof event.valueQty === "string" && event.valueQty.length > 0
      ? event.valueQty
      : (process.env.RANGING_VALUE_QTY ?? "100");

  if (bots.length === 0) {
    console.warn(
      "[ranging-tick] No enabled bot configs. Set RANGING_BOTS_JSON or pass event.symbols.",
    );
    const emptySummary = {
      processed: 0,
      signaled: 0,
      failed: 0,
      skippedNotDue: 0,
      skippedUnsupportedExecutionTimeframe: 0,
      total: 0,
      dryRun: globalDryRun,
      symbolFilterCount: eventSymbols.length,
    };
    await publishTickSummary(emptySummary);
    return emptySummary;
  }

  let processed = 0;
  let signaled = 0;
  let failed = 0;
  let skippedNotDue = 0;
  let skippedUnsupportedExecutionTimeframe = 0;

  for (const bot of bots) {
    if (!isExecutionTimeframeCompatibleForHourlyDispatch(bot)) {
      skippedUnsupportedExecutionTimeframe += 1;
      console.warn(
        "[ranging-tick] skipped bot due unsupported execution timeframe for hourly dispatcher",
        {
          botId: bot.id,
          symbol: bot.symbol,
          executionTimeframe: bot.runtime.executionTimeframe,
        },
      );
      continue;
    }

    const closedExecutionCandleEndTimeMs = getClosedCandleEndTime(
      nowMs,
      bot.runtime.executionTimeframe,
    );
    const cursor = await getProcessingCursor(
      bot.symbol,
      bot.runtime.executionTimeframe,
    );
    if (
      cursor &&
      cursor.lastProcessedCandleCloseMs >= closedExecutionCandleEndTimeMs
    ) {
      skippedNotDue += 1;
      continue;
    }

    const runInput = toRunInput(bot, closedExecutionCandleEndTimeMs);
    const positionBefore = await getLatestOpenPositionByBot(bot.id);

    try {
      const executionContext = await buildExecutionContext(bot, globalDryRun);
      const adapter = exchangeAdapterRegistry.get(bot.exchangeId);
      const instance = createBotRuntime({
        bot,
        adapter,
        executionContext,
        signalProcessorOptions: {
          dryRun: executionContext.dryRun,
          marginMode: bot.runtime.marginMode ?? globalMarginMode,
          valueQty: bot.runtime.valueQty ?? globalValueQty,
        },
      });

      const strategyEvent = await instance.runOnce(
        runInput,
        toPositionState(positionBefore ?? null),
      );
      processed += 1;

      if (extractEntrySide(strategyEvent.decision)) {
        signaled += 1;
      }

      const runRecord = toRunRecord(
        bot,
        runInput,
        positionBefore ?? null,
        strategyEvent,
      );
      const reconciledPosition = reconcilePositionRecord(
        bot,
        positionBefore ?? null,
        runRecord.processing,
        runRecord.generatedAtMs,
      );
      const orderRecord = buildOrderRecord(
        bot,
        positionBefore ?? null,
        runRecord.processing,
        runRecord.generatedAtMs,
      );
      const fillRecords = buildFillRecords(
        bot,
        positionBefore ?? null,
        runRecord.processing,
        runRecord.generatedAtMs,
      );
      const reconciliationEvent = buildReconciliationEventRecord(
        bot,
        positionBefore ?? null,
        runRecord.processing,
        runRecord.generatedAtMs,
      );

      await persistAndBroadcast(runRecord);
      await Promise.allSettled([
        reconciledPosition
          ? putPositionRecord(reconciledPosition)
          : Promise.resolve(),
        orderRecord ? putOrderRecord(orderRecord) : Promise.resolve(),
        reconciliationEvent
          ? putReconciliationEventRecord(reconciliationEvent)
          : Promise.resolve(),
        ...fillRecords.map((record) => putFillRecord(record)),
      ]);
      await advanceProcessingCursor({
        symbol: bot.symbol,
        timeframe: bot.runtime.executionTimeframe,
        nextClosedCandleMs: closedExecutionCandleEndTimeMs,
        generatedAtMs: runRecord.generatedAtMs,
      });

      console.log("[ranging-tick] run", {
        botId: bot.id,
        symbol: bot.symbol,
        intents: strategyEvent.decision.intents.map((intent) => intent.kind),
        reasons: strategyEvent.decision.reasons,
        generatedAtMs: strategyEvent.generatedAtMs,
        endTimeMs: runInput.endTimeMs,
        processing: strategyEvent.processing,
      });
    } catch (error) {
      failed += 1;
      const failedRecord = toFailedRunRecord(bot, runInput, error);
      await persistAndBroadcast(failedRecord);
      console.error("[ranging-tick] run failed", {
        botId: bot.id,
        symbol: bot.symbol,
        executionTimeframe: bot.runtime.executionTimeframe,
        error,
      });
    }
  }

  const summary = {
    processed,
    signaled,
    failed,
    skippedNotDue,
    skippedUnsupportedExecutionTimeframe,
    total: bots.length,
    dryRun: globalDryRun,
    symbolFilterCount: eventSymbols.length,
  };
  await publishTickSummary(summary);
  return summary;
};
