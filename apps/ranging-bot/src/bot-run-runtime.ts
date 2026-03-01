import type { ExecutionContext, PositionState, StrategySignalEvent } from "@repo/trading-engine";
import { runtimeAccountResolver } from "./account-resolver";
import type { OrchestratorRunInput } from "./contracts";
import { buildFillRecords, buildOrderRecord, buildReconciliationEventRecord, reconcilePositionRecord } from "./execution-ledger";
import { publishRunRecord } from "./monitoring/realtime";
import { putDecisionRecord, putFillRecord, putOrderRecord, putPositionRecord, putReconciliationEventRecord, putRunRecord } from "./monitoring/store";
import type { AccountRecord, BotRecord, BotRunRecord, DecisionRecord, PositionRecord } from "./monitoring/types";
import { getRuntimeSettings } from "./runtime-settings";
import { strategyRegistry } from "./strategy-registry";

export interface GlobalExecutionDefaults {
  dryRun: boolean;
  marginMode: "CROSS" | "ISOLATED";
  valueQty: string;
}

export function getGlobalExecutionDefaults(overrides?: {
  dryRun?: string;
  marginMode?: string;
  valueQty?: string;
}): GlobalExecutionDefaults {
  const runtimeSettings = getRuntimeSettings();
  return {
    dryRun:
      typeof overrides?.dryRun === "string"
        ? overrides.dryRun.trim().toLowerCase() === "true"
        : runtimeSettings.defaultDryRun,
    marginMode:
      overrides?.marginMode === "ISOLATED" || overrides?.marginMode === "CROSS"
        ? overrides.marginMode
        : runtimeSettings.defaultMarginMode,
    valueQty:
      typeof overrides?.valueQty === "string" && overrides.valueQty.length > 0
        ? overrides.valueQty
        : runtimeSettings.defaultValueQty,
  };
}

export async function buildExecutionContext(
  bot: BotRecord,
  globalDryRun: boolean,
): Promise<ExecutionContext<AccountRecord>> {
  const account = await runtimeAccountResolver.requireAccount(bot.accountId, bot.exchangeId);
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

export function toRunInput(
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

function extractEntrySide(decision: {
  intents: Array<{ kind: string; side?: "long" | "short" }>;
}): "long" | "short" | null {
  const enterIntent = decision.intents.find((intent) => intent.kind === "enter");
  return enterIntent?.side ?? null;
}

export function toRunRecord(
  bot: BotRecord,
  runInput: Omit<OrchestratorRunInput, "bot">,
  positionBefore: PositionRecord | null,
  event: StrategySignalEvent,
): BotRunRecord {
  const manifest = strategyRegistry.getManifest(bot.strategyId);
  const processing = event.processing ?? {
    status: extractEntrySide(event.decision) ? "error" : "no-signal",
    side: extractEntrySide(event.decision) ?? undefined,
    message: "Missing processing result",
  };
  const strategyAnalysis = manifest.buildAnalysis({
    snapshot: event.snapshot,
    decision: event.decision,
  });

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
    deploymentId: bot.deploymentId,
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
    strategyAnalysis,
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

export function toDecisionRecord(
  bot: BotRecord,
  event: StrategySignalEvent,
): DecisionRecord {
  const manifest = strategyRegistry.getManifest(bot.strategyId);
  const strategyAnalysis = manifest.buildAnalysis({
    snapshot: event.snapshot,
    decision: event.decision,
  });
  const primaryIntent = event.decision.intents.find(
    (intent) =>
      intent.kind === "enter" ||
      intent.kind === "close" ||
      intent.kind === "reduce" ||
      intent.kind === "move-stop",
  );

  return {
    id: `${bot.deploymentId}-${event.generatedAtMs}`,
    deploymentId: bot.deploymentId,
    strategyId: bot.strategyId,
    strategyVersion: bot.strategyVersion,
    botId: bot.id,
    symbol: bot.symbol,
    decisionTime: event.generatedAtMs,
    generatedAtMs: event.generatedAtMs,
    action:
      primaryIntent?.kind === "enter"
        ? "trade"
        : primaryIntent?.kind === "close"
          ? "exit"
          : event.decision.intents.some((intent) => intent.kind !== "hold")
            ? "trade"
            : "hold",
    direction:
      primaryIntent && "side" in primaryIntent
        ? primaryIntent.side
        : undefined,
    reasons: event.decision.reasons,
    decision: event.decision as unknown as Record<string, unknown>,
    snapshot: event.snapshot as Record<string, unknown>,
    strategyAnalysis,
  };
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

export function toFailedRunRecord(
  bot: BotRecord,
  runInput: Omit<OrchestratorRunInput, "bot">,
  error: unknown,
): BotRunRecord {
  const message = toErrorMessage(error);
  const recordedAtMs = Date.now();

  return {
    id: `${bot.id}-${recordedAtMs}`,
    botId: bot.id,
    deploymentId: bot.deploymentId,
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

export function toPositionState(record: PositionRecord | null): PositionState | null {
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

export async function persistRunOutcome(
  bot: BotRecord,
  positionBefore: PositionRecord | null,
  runRecord: BotRunRecord,
  decisionRecord?: DecisionRecord,
): Promise<void> {
  const reconciledPosition = reconcilePositionRecord(
    bot,
    positionBefore,
    runRecord.processing,
    runRecord.generatedAtMs,
  );
  const orderRecord = buildOrderRecord(
    bot,
    positionBefore,
    runRecord.processing,
    runRecord.generatedAtMs,
  );
  const fillRecords = buildFillRecords(
    bot,
    positionBefore,
    runRecord.processing,
    runRecord.generatedAtMs,
  );
  const reconciliationEvent = buildReconciliationEventRecord(
    bot,
    positionBefore,
    runRecord.processing,
    runRecord.generatedAtMs,
  );

  await Promise.allSettled([
    putRunRecord(runRecord),
    decisionRecord ? putDecisionRecord(decisionRecord) : Promise.resolve(),
    publishRunRecord(runRecord),
  ]);
  await Promise.allSettled([
    reconciledPosition ? putPositionRecord(reconciledPosition) : Promise.resolve(),
    orderRecord ? putOrderRecord(orderRecord) : Promise.resolve(),
    reconciliationEvent ? putReconciliationEventRecord(reconciliationEvent) : Promise.resolve(),
    ...fillRecords.map((record) => putFillRecord(record)),
  ]);
}
