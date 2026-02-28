import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import {
  decryptAccountAuth,
  encryptAccountAuth,
  type EncryptedAccountAuthPayload,
} from "../account-crypto";
import type {
  AccountRecord,
  BacktestAiEvaluation,
  BacktestAiSummary,
  BacktestRecord,
  BotRecord,
  BotRunRecord,
  FillRecord,
  KlineCacheReference,
  OrderRecord,
  PositionRecord,
  ProcessingCursorRecord,
  RangeValidationRecord,
  ReconciliationEventRecord,
} from "./types";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 120;
const PK_RUN = "RUN";
const PK_BACKTEST = "BACKTEST";
const PK_VALIDATION = "VALIDATION";
const PK_CURSOR = "CURSOR";
const PK_BOT_PREFIX = "BOT#";
const PK_ACCOUNT_PREFIX = "ACCOUNT#";
const GSI_BY_SYMBOL = "BySymbol";
const ACCOUNTS_GSI_BY_NAME = "ByName";

let cachedDocClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (cachedDocClient) return cachedDocClient;

  const baseClient = new DynamoDBClient({});
  cachedDocClient = DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  return cachedDocClient;
}

function getTableName(): string {
  const resources = Resource as unknown as Record<
    string,
    { name?: string } | undefined
  >;
  const fromResource = resources.RangingBotRuns?.name;
  if (fromResource) return fromResource;

  throw new Error("Missing linked Resource.RangingBotRuns");
}

function getAccountsTableName(): string {
  const resources = Resource as unknown as Record<
    string,
    { name?: string } | undefined
  >;
  const fromResource = resources.RangingAccounts?.name;
  if (fromResource) return fromResource;

  throw new Error("Missing linked Resource.RangingAccounts");
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function padTime(timestampMs: number): string {
  return String(timestampMs).padStart(13, "0");
}

function sortKey(timestampMs: number, symbol: string): string {
  return `${padTime(timestampMs)}#${symbol}`;
}

function gsiKey(timestampMs: number): string {
  return padTime(timestampMs);
}

function cursorSortKey(symbol: string, timeframe: string): string {
  return `${symbol}#${timeframe}`;
}

function botPartitionKey(botId: string): string {
  return `${PK_BOT_PREFIX}${botId}`;
}

function botSortKey(botId: string): string {
  return `BOT#${botId}`;
}

function positionSortKey(positionId: string): string {
  return `POSITION#${positionId}`;
}

function orderSortKey(createdAtMs: number, orderId: string): string {
  return `ORDER#${padTime(createdAtMs)}#${orderId}`;
}

function fillSortKey(createdAtMs: number, fillId: string): string {
  return `FILL#${padTime(createdAtMs)}#${fillId}`;
}

function reconciliationSortKey(createdAtMs: number, eventId: string): string {
  return `RECON#${padTime(createdAtMs)}#${eventId}`;
}

function accountPartitionKey(accountId: string): string {
  return `${PK_ACCOUNT_PREFIX}${accountId}`;
}

function accountSortKey(accountId: string): string {
  return `ACCOUNT#${accountId}`;
}

function parseRunId(item: Record<string, unknown>): string {
  if (typeof item.id === "string" && item.id.length > 0) {
    return item.id;
  }
  return `run-${String(item.symbol ?? "unknown")}-${String(item.generatedAtMs ?? "0")}`;
}

function toItem(record: BotRunRecord): Record<string, unknown> {
  return {
    PK: PK_RUN,
    SK: sortKey(record.generatedAtMs, record.symbol),
    GSI1PK: `BOT#${record.symbol}`,
    GSI1SK: gsiKey(record.generatedAtMs),
    ...record,
  };
}

function toBotItem(record: BotRecord): Record<string, unknown> {
  return {
    PK: botPartitionKey(record.id),
    SK: botSortKey(record.id),
    GSI1PK: "BOTDEF",
    GSI1SK: `${record.name}#${record.id}`,
    ...record,
  };
}

function toAccountItem(record: AccountRecord): Record<string, unknown> {
  const encryptedAuth = encryptAccountAuth(record.auth, {
    accountId: record.id,
    exchangeId: record.exchangeId,
  });

  return {
    PK: accountPartitionKey(record.id),
    SK: accountSortKey(record.id),
    GSI1PK: "ACCOUNTDEF",
    GSI1SK: `${record.exchangeId}#${record.name}#${record.id}`,
    id: record.id,
    accountId: record.id,
    name: record.name,
    exchangeId: record.exchangeId,
    status: record.status,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
    metadata: record.metadata,
    hasAuth: {
      apiKey: record.auth.apiKey.trim().length > 0,
      apiSecret: record.auth.apiSecret.trim().length > 0,
      apiPassphrase: (record.auth.apiPassphrase?.trim().length ?? 0) > 0,
    },
    encryptedAuth,
  };
}

function toPositionItem(record: PositionRecord): Record<string, unknown> {
  return {
    PK: botPartitionKey(record.botId),
    SK: positionSortKey(record.id),
    GSI1PK: `POSITION#${record.symbol}`,
    GSI1SK: `${record.status}#${padTime(record.lastExchangeSyncTimeMs ?? record.openedAtMs ?? Date.now())}#${record.botId}`,
    ...record,
  };
}

function toOrderItem(record: OrderRecord): Record<string, unknown> {
  return {
    PK: botPartitionKey(record.botId),
    SK: orderSortKey(record.createdAtMs, record.id),
    GSI1PK: `ORDER#${record.symbol}`,
    GSI1SK: `${record.status}#${padTime(record.createdAtMs)}#${record.botId}`,
    ...record,
  };
}

function toFillItem(record: FillRecord): Record<string, unknown> {
  return {
    PK: botPartitionKey(record.botId),
    SK: fillSortKey(record.createdAtMs, record.id),
    GSI1PK: `FILL#${record.symbol}`,
    GSI1SK: `${record.reason}#${padTime(record.createdAtMs)}#${record.botId}`,
    ...record,
  };
}

function toReconciliationItem(
  record: ReconciliationEventRecord,
): Record<string, unknown> {
  return {
    PK: botPartitionKey(record.botId),
    SK: reconciliationSortKey(record.createdAtMs, record.id),
    GSI1PK: `RECON#${record.symbol}`,
    GSI1SK: `${record.status}#${padTime(record.createdAtMs)}#${record.botId}`,
    ...record,
  };
}

function toBacktestItem(record: BacktestRecord): Record<string, unknown> {
  return {
    PK: PK_BACKTEST,
    SK: sortKey(record.createdAtMs, record.id),
    GSI1PK: `BACKTEST#${record.symbol}`,
    GSI1SK: gsiKey(record.createdAtMs),
    ...record,
  };
}

function toValidationItem(
  record: RangeValidationRecord,
): Record<string, unknown> {
  return {
    PK: PK_VALIDATION,
    SK: sortKey(record.createdAtMs, record.id),
    GSI1PK: `VALIDATION#${record.symbol}`,
    GSI1SK: gsiKey(record.createdAtMs),
    ...record,
  };
}

function fromItem(item: Record<string, unknown>): BotRunRecord {
  return {
    id: parseRunId(item),
    botId:
      typeof item.botId === "string"
        ? item.botId
        : `legacy-${String(item.symbol ?? "unknown")}`,
    botName:
      typeof item.botName === "string"
        ? item.botName
        : String(item.symbol ?? "unknown"),
    strategyId:
      typeof item.strategyId === "string" ? item.strategyId : "range-reversal",
    strategyVersion:
      typeof item.strategyVersion === "string" ? item.strategyVersion : "1",
    exchangeId:
      typeof item.exchangeId === "string" ? item.exchangeId : "kucoin",
    accountId: typeof item.accountId === "string" ? item.accountId : "default",
    symbol: String(item.symbol),
    generatedAtMs: Number(item.generatedAtMs),
    recordedAtMs: Number(item.recordedAtMs),
    latencyMs: typeof item.latencyMs === "number" ? item.latencyMs : undefined,
    runStatus: item.runStatus === "failed" ? "failed" : "ok",
    executionTimeframe: String(
      item.executionTimeframe,
    ) as BotRunRecord["executionTimeframe"],
    primaryRangeTimeframe: String(
      item.primaryRangeTimeframe,
    ) as BotRunRecord["primaryRangeTimeframe"],
    secondaryRangeTimeframe: String(
      item.secondaryRangeTimeframe,
    ) as BotRunRecord["secondaryRangeTimeframe"],
    signal:
      item.signal === "long" || item.signal === "short" ? item.signal : null,
    reasons: Array.isArray(item.reasons)
      ? item.reasons.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    price: typeof item.price === "number" ? item.price : undefined,
    rangeVal: typeof item.rangeVal === "number" ? item.rangeVal : undefined,
    rangeVah: typeof item.rangeVah === "number" ? item.rangeVah : undefined,
    rangePoc: typeof item.rangePoc === "number" ? item.rangePoc : undefined,
    rangeIsAligned:
      typeof item.rangeIsAligned === "boolean"
        ? item.rangeIsAligned
        : undefined,
    rangeOverlapRatio:
      typeof item.rangeOverlapRatio === "number"
        ? item.rangeOverlapRatio
        : undefined,
    bullishDivergence:
      typeof item.bullishDivergence === "boolean"
        ? item.bullishDivergence
        : undefined,
    bearishDivergence:
      typeof item.bearishDivergence === "boolean"
        ? item.bearishDivergence
        : undefined,
    bullishSfp:
      typeof item.bullishSfp === "boolean" ? item.bullishSfp : undefined,
    bearishSfp:
      typeof item.bearishSfp === "boolean" ? item.bearishSfp : undefined,
    moneyFlowSlope:
      typeof item.moneyFlowSlope === "number" ? item.moneyFlowSlope : undefined,
    positionStatusBefore:
      typeof item.positionStatusBefore === "string"
        ? item.positionStatusBefore
        : undefined,
    positionStatusAfter:
      typeof item.positionStatusAfter === "string"
        ? item.positionStatusAfter
        : undefined,
    exchangeReconciliationStatus:
      item.exchangeReconciliationStatus === "ok" ||
      item.exchangeReconciliationStatus === "drift" ||
      item.exchangeReconciliationStatus === "error"
        ? item.exchangeReconciliationStatus
        : undefined,
    processing: {
      status:
        typeof item.processing === "object" &&
        item.processing &&
        typeof (item.processing as { status?: unknown }).status === "string"
          ? (
              item.processing as {
                status: BotRunRecord["processing"]["status"];
              }
            ).status
          : "error",
      side:
        typeof item.processing === "object" &&
        item.processing &&
        ((item.processing as { side?: unknown }).side === "long" ||
          (item.processing as { side?: unknown }).side === "short")
          ? (item.processing as { side: "long" | "short" }).side
          : undefined,
      message:
        typeof item.processing === "object" &&
        item.processing &&
        typeof (item.processing as { message?: unknown }).message === "string"
          ? (item.processing as { message: string }).message
          : undefined,
      orderId:
        typeof item.processing === "object" &&
        item.processing &&
        typeof (item.processing as { orderId?: unknown }).orderId === "string"
          ? (item.processing as { orderId: string }).orderId
          : undefined,
      clientOid:
        typeof item.processing === "object" &&
        item.processing &&
        typeof (item.processing as { clientOid?: unknown }).clientOid ===
          "string"
          ? (item.processing as { clientOid: string }).clientOid
          : undefined,
      positionSnapshot:
        typeof item.processing === "object" &&
        item.processing &&
        typeof (item.processing as { positionSnapshot?: unknown })
          .positionSnapshot === "object"
          ? (
              item.processing as {
                positionSnapshot: BotRunRecord["processing"]["positionSnapshot"];
              }
            ).positionSnapshot
          : undefined,
    },
    errorMessage:
      typeof item.errorMessage === "string" ? item.errorMessage : undefined,
  };
}

function fromBacktestItem(item: Record<string, unknown>): BacktestRecord {
  const rawStatus = typeof item.status === "string" ? item.status : undefined;
  const status: BacktestRecord["status"] =
    rawStatus === "running" ||
    rawStatus === "completed" ||
    rawStatus === "failed"
      ? rawStatus
      : "failed";

  const rawRefs = Array.isArray(item.klineRefs) ? item.klineRefs : [];
  const klineRefs = rawRefs
    .map((entry): KlineCacheReference | undefined => {
      if (!entry || typeof entry !== "object") return undefined;
      const row = entry as Record<string, unknown>;

      const key = typeof row.key === "string" ? row.key : undefined;
      const symbol = typeof row.symbol === "string" ? row.symbol : undefined;
      const timeframe =
        typeof row.timeframe === "string"
          ? (row.timeframe as KlineCacheReference["timeframe"])
          : undefined;
      const fromMs = Number(row.fromMs);
      const toMs = Number(row.toMs);
      const candleCount = Number(row.candleCount);

      if (
        !key ||
        !symbol ||
        !timeframe ||
        !Number.isFinite(fromMs) ||
        !Number.isFinite(toMs) ||
        !Number.isFinite(candleCount)
      ) {
        return undefined;
      }

      return {
        key,
        symbol,
        timeframe,
        fromMs,
        toMs,
        candleCount,
        url: typeof row.url === "string" ? row.url : undefined,
      };
    })
    .filter((entry): entry is KlineCacheReference => Boolean(entry));

  const rawAi = item.ai;
  const ai =
    rawAi && typeof rawAi === "object"
      ? (() => {
          const row = rawAi as Record<string, unknown>;
          const enabled = row.enabled;
          const lookbackCandles = Number(row.lookbackCandles);
          const cadenceBars = Number(row.cadenceBars);
          const maxEvaluations = Number(row.maxEvaluations);
          const confidenceThreshold = Number(row.confidenceThreshold);
          const modelPrimary =
            typeof row.modelPrimary === "string" ? row.modelPrimary : "";
          const modelFallback =
            typeof row.modelFallback === "string" ? row.modelFallback : "";
          const effectiveCadenceBars = Number(row.effectiveCadenceBars);
          const plannedEvaluationsRaw = Number(row.plannedEvaluations);
          const evaluationsRun = Number(row.evaluationsRun);
          const evaluationsAccepted = Number(row.evaluationsAccepted);
          const fallbackUsed = Number(row.fallbackUsed);
          const failed = Number(row.failed);
          const rawEvaluations = Array.isArray(row.evaluations)
            ? row.evaluations
            : [];
          const evaluations = rawEvaluations
            .map((entry): BacktestAiEvaluation | undefined => {
              if (!entry || typeof entry !== "object") return undefined;
              const evalRow = entry as Record<string, unknown>;
              const atIndex = Number(evalRow.atIndex);
              const atTime = Number(evalRow.atTime);
              const finalModel =
                typeof evalRow.finalModel === "string"
                  ? evalRow.finalModel
                  : "";
              const usedFallback = evalRow.usedFallback;
              const isRanging = evalRow.isRanging;
              const confidence = Number(evalRow.confidence);
              const accepted = evalRow.accepted;
              const rangeRaw = evalRow.range;
              const reasonsRaw = evalRow.reasons;
              const range =
                rangeRaw && typeof rangeRaw === "object"
                  ? (rangeRaw as Record<string, unknown>)
                  : undefined;
              const val = Number(range?.val);
              const poc = Number(range?.poc);
              const vah = Number(range?.vah);
              const reasons = Array.isArray(reasonsRaw)
                ? reasonsRaw.filter(
                    (value): value is string => typeof value === "string",
                  )
                : [];

              if (!Number.isFinite(atIndex) || !Number.isFinite(atTime))
                return undefined;
              if (!finalModel) return undefined;
              if (typeof usedFallback !== "boolean") return undefined;
              if (typeof isRanging !== "boolean") return undefined;
              if (!Number.isFinite(confidence)) return undefined;
              if (typeof accepted !== "boolean") return undefined;
              if (![val, poc, vah].every((value) => Number.isFinite(value)))
                return undefined;

              return {
                atIndex,
                atTime,
                finalModel,
                usedFallback,
                isRanging,
                confidence,
                accepted,
                range: {
                  val,
                  poc,
                  vah,
                },
                reasons,
                errorMessage:
                  typeof evalRow.errorMessage === "string"
                    ? evalRow.errorMessage
                    : undefined,
              };
            })
            .filter((entry): entry is BacktestAiEvaluation => Boolean(entry));

          if (typeof enabled !== "boolean") return undefined;
          if (!Number.isFinite(lookbackCandles)) return undefined;
          if (!Number.isFinite(cadenceBars)) return undefined;
          if (!Number.isFinite(maxEvaluations)) return undefined;
          if (!Number.isFinite(confidenceThreshold)) return undefined;
          if (!Number.isFinite(effectiveCadenceBars)) return undefined;
          const plannedEvaluations = Number.isFinite(plannedEvaluationsRaw)
            ? plannedEvaluationsRaw
            : Number.isFinite(maxEvaluations)
              ? maxEvaluations
              : evaluations.length;
          if (!Number.isFinite(evaluationsRun)) return undefined;
          if (!Number.isFinite(evaluationsAccepted)) return undefined;
          if (!Number.isFinite(fallbackUsed)) return undefined;
          if (!Number.isFinite(failed)) return undefined;
          if (!modelPrimary || !modelFallback) return undefined;

          return {
            enabled,
            lookbackCandles,
            cadenceBars,
            maxEvaluations,
            confidenceThreshold,
            modelPrimary,
            modelFallback,
            effectiveCadenceBars,
            plannedEvaluations,
            evaluationsRun,
            evaluationsAccepted,
            fallbackUsed,
            failed,
            evaluations,
          } satisfies BacktestAiSummary;
        })()
      : undefined;

  return {
    id: String(item.id),
    createdAtMs: Number(item.createdAtMs),
    status,
    botId:
      typeof item.botId === "string"
        ? item.botId
        : `legacy-${String(item.symbol ?? "unknown")}`,
    botName:
      typeof item.botName === "string"
        ? item.botName
        : String(item.symbol ?? "unknown"),
    strategyId:
      typeof item.strategyId === "string" ? item.strategyId : "range-reversal",
    strategyVersion:
      typeof item.strategyVersion === "string" ? item.strategyVersion : "1",
    exchangeId:
      typeof item.exchangeId === "string" ? item.exchangeId : "kucoin",
    accountId: typeof item.accountId === "string" ? item.accountId : "default",
    symbol: String(item.symbol),
    fromMs: Number(item.fromMs),
    toMs: Number(item.toMs),
    executionTimeframe: String(
      item.executionTimeframe,
    ) as BacktestRecord["executionTimeframe"],
    primaryRangeTimeframe: String(
      item.primaryRangeTimeframe,
    ) as BacktestRecord["primaryRangeTimeframe"],
    secondaryRangeTimeframe: String(
      item.secondaryRangeTimeframe,
    ) as BacktestRecord["secondaryRangeTimeframe"],
    initialEquity: Number(item.initialEquity),
    totalTrades: Number(item.totalTrades),
    wins: Number(item.wins),
    losses: Number(item.losses),
    winRate: Number(item.winRate),
    netPnl: Number(item.netPnl),
    grossProfit: Number(item.grossProfit),
    grossLoss: Number(item.grossLoss),
    maxDrawdownPct: Number(item.maxDrawdownPct),
    endingEquity: Number(item.endingEquity),
    klineRefs,
    ai,
    errorMessage:
      typeof item.errorMessage === "string" ? item.errorMessage : undefined,
  };
}

function fromValidationItem(
  item: Record<string, unknown>,
): RangeValidationRecord {
  const rawStatus = typeof item.status === "string" ? item.status : undefined;
  const status: RangeValidationRecord["status"] =
    rawStatus === "pending" ||
    rawStatus === "completed" ||
    rawStatus === "failed"
      ? rawStatus
      : "failed";

  const rawResult = item.result;
  const normalizedResult =
    rawResult && typeof rawResult === "object"
      ? (() => {
          const result = rawResult as Record<string, unknown>;
          const rawRange = result.range;
          const range =
            rawRange && typeof rawRange === "object"
              ? (rawRange as Record<string, unknown>)
              : undefined;

          const isRanging = result.isRanging;
          const confidence = Number(result.confidence);
          const timeframeDetected = result.timeframeDetected;
          const val = Number(range?.val);
          const poc = Number(range?.poc);
          const vah = Number(range?.vah);
          const reasons = Array.isArray(result.reasons)
            ? result.reasons.filter(
                (value): value is string => typeof value === "string",
              )
            : [];
          const normalizedTimeframeDetected: NonNullable<
            RangeValidationRecord["result"]
          >["timeframeDetected"] =
            timeframeDetected === "1m" ||
            timeframeDetected === "3m" ||
            timeframeDetected === "5m" ||
            timeframeDetected === "15m" ||
            timeframeDetected === "30m" ||
            timeframeDetected === "1h" ||
            timeframeDetected === "2h" ||
            timeframeDetected === "4h" ||
            timeframeDetected === "6h" ||
            timeframeDetected === "8h" ||
            timeframeDetected === "12h" ||
            timeframeDetected === "1d" ||
            timeframeDetected === "1w" ||
            timeframeDetected === "unknown"
              ? timeframeDetected
              : "unknown";

          if (typeof isRanging !== "boolean") return undefined;
          if (!Number.isFinite(confidence)) return undefined;
          if (
            timeframeDetected !== "unknown" &&
            typeof timeframeDetected !== "string"
          ) {
            return undefined;
          }
          if (![val, poc, vah].every((value) => Number.isFinite(value))) {
            return undefined;
          }

          return {
            isRanging,
            confidence,
            timeframeDetected: normalizedTimeframeDetected,
            range: {
              val,
              poc,
              vah,
            },
            reasons,
          };
        })()
      : undefined;

  return {
    id: String(item.id),
    botId:
      typeof item.botId === "string"
        ? item.botId
        : `legacy-${String(item.symbol ?? "unknown")}`,
    botName:
      typeof item.botName === "string"
        ? item.botName
        : String(item.symbol ?? "unknown"),
    strategyId:
      typeof item.strategyId === "string" ? item.strategyId : "range-reversal",
    createdAtMs: Number(item.createdAtMs),
    status,
    symbol: String(item.symbol),
    timeframe: String(item.timeframe) as RangeValidationRecord["timeframe"],
    fromMs: Number(item.fromMs),
    toMs: Number(item.toMs),
    candlesCount: Number(item.candlesCount),
    modelPrimary: String(item.modelPrimary),
    modelFallback: String(item.modelFallback),
    confidenceThreshold: Number(item.confidenceThreshold),
    finalModel:
      typeof item.finalModel === "string" ? item.finalModel : undefined,
    result: normalizedResult,
    errorMessage:
      typeof item.errorMessage === "string" ? item.errorMessage : undefined,
  };
}

function fromCursorItem(
  item: Record<string, unknown>,
): ProcessingCursorRecord | undefined {
  const symbol = typeof item.symbol === "string" ? item.symbol : undefined;
  const timeframe =
    typeof item.timeframe === "string" ? item.timeframe : undefined;
  const lastProcessedCandleCloseMs = Number(item.lastProcessedCandleCloseMs);
  const updatedAtMs = Number(item.updatedAtMs);
  const lastRunGeneratedAtMsRaw = item.lastRunGeneratedAtMs;
  const lastRunGeneratedAtMs = Number(lastRunGeneratedAtMsRaw);

  if (!symbol || !timeframe) return undefined;
  if (!Number.isFinite(lastProcessedCandleCloseMs)) return undefined;
  if (!Number.isFinite(updatedAtMs)) return undefined;

  return {
    symbol,
    timeframe: timeframe as ProcessingCursorRecord["timeframe"],
    lastProcessedCandleCloseMs,
    lastRunGeneratedAtMs: Number.isFinite(lastRunGeneratedAtMs)
      ? lastRunGeneratedAtMs
      : undefined,
    updatedAtMs,
  };
}

function fromBotItem(item: Record<string, unknown>): BotRecord | undefined {
  const id = typeof item.id === "string" ? item.id : undefined;
  const name = typeof item.name === "string" ? item.name : undefined;
  const symbol = typeof item.symbol === "string" ? item.symbol : undefined;
  const strategyId =
    typeof item.strategyId === "string" ? item.strategyId : undefined;
  const strategyVersion =
    typeof item.strategyVersion === "string" ? item.strategyVersion : undefined;
  const exchangeId =
    typeof item.exchangeId === "string" ? item.exchangeId : undefined;
  const accountId =
    typeof item.accountId === "string" ? item.accountId : undefined;
  const status =
    item.status === "active" ||
    item.status === "paused" ||
    item.status === "archived"
      ? item.status
      : undefined;
  const createdAtMs = Number(item.createdAtMs);
  const updatedAtMs = Number(item.updatedAtMs);
  const execution =
    item.execution && typeof item.execution === "object"
      ? (item.execution as Record<string, unknown>)
      : undefined;
  const context =
    item.context && typeof item.context === "object"
      ? (item.context as Record<string, unknown>)
      : undefined;
  const runtime =
    item.runtime && typeof item.runtime === "object"
      ? (item.runtime as Record<string, unknown>)
      : undefined;

  if (
    !id ||
    !name ||
    !symbol ||
    !strategyId ||
    !strategyVersion ||
    !exchangeId ||
    !accountId ||
    !status
  ) {
    return undefined;
  }
  if (
    !Number.isFinite(createdAtMs) ||
    !Number.isFinite(updatedAtMs) ||
    !execution ||
    !context ||
    !runtime
  ) {
    return undefined;
  }

  return {
    id,
    name,
    strategyId,
    strategyVersion,
    exchangeId,
    accountId,
    symbol,
    marketType:
      item.marketType === "spot" ||
      item.marketType === "perp" ||
      item.marketType === "futures"
        ? item.marketType
        : "futures",
    status,
    execution: {
      trigger: execution.trigger === "event" ? "event" : "cron",
      executionTimeframe: String(
        execution.executionTimeframe,
      ) as BotRecord["execution"]["executionTimeframe"],
      warmupBars: Number(execution.warmupBars ?? 0),
    },
    context: {
      primaryPriceTimeframe: String(
        context.primaryPriceTimeframe,
      ) as BotRecord["context"]["primaryPriceTimeframe"],
      additionalTimeframes: Array.isArray(context.additionalTimeframes)
        ? context.additionalTimeframes.filter(
            (
              value,
            ): value is BotRecord["context"]["additionalTimeframes"][number] =>
              typeof value === "string",
          )
        : [],
      providers: Array.isArray(context.providers)
        ? context.providers.filter(
            (value): value is BotRecord["context"]["providers"][number] =>
              Boolean(value) && typeof value === "object",
          )
        : [],
    },
    riskProfileId:
      typeof item.riskProfileId === "string"
        ? item.riskProfileId
        : `${id}:risk`,
    strategyConfig:
      item.strategyConfig && typeof item.strategyConfig === "object"
        ? (item.strategyConfig as Record<string, unknown>)
        : {},
    metadata:
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : undefined,
    createdAtMs,
    updatedAtMs,
    runtime: {
      executionTimeframe: String(
        runtime.executionTimeframe,
      ) as BotRecord["runtime"]["executionTimeframe"],
      executionLimit: Number(runtime.executionLimit ?? 0),
      primaryRangeTimeframe: String(
        runtime.primaryRangeTimeframe,
      ) as BotRecord["runtime"]["primaryRangeTimeframe"],
      primaryRangeLimit: Number(runtime.primaryRangeLimit ?? 0),
      secondaryRangeTimeframe: String(
        runtime.secondaryRangeTimeframe,
      ) as BotRecord["runtime"]["secondaryRangeTimeframe"],
      secondaryRangeLimit: Number(runtime.secondaryRangeLimit ?? 0),
      dryRun: typeof runtime.dryRun === "boolean" ? runtime.dryRun : undefined,
      marginMode:
        runtime.marginMode === "ISOLATED"
          ? "ISOLATED"
          : runtime.marginMode === "CROSS"
            ? "CROSS"
            : undefined,
      valueQty:
        typeof runtime.valueQty === "string" ? runtime.valueQty : undefined,
    },
  };
}

function fromAccountItem(
  item: Record<string, unknown>,
): AccountRecord | undefined {
  const id =
    typeof item.id === "string"
      ? item.id
      : typeof item.accountId === "string"
        ? item.accountId
        : undefined;
  const name = typeof item.name === "string" ? item.name : undefined;
  const exchangeId =
    typeof item.exchangeId === "string" ? item.exchangeId : undefined;
  const status =
    item.status === "active" || item.status === "archived"
      ? item.status
      : undefined;
  const createdAtMs = Number(item.createdAtMs);
  const updatedAtMs = Number(item.updatedAtMs);
  if (!id || !name || !exchangeId || !status) return undefined;
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(updatedAtMs))
    return undefined;

  const encryptedAuth =
    item.encryptedAuth && typeof item.encryptedAuth === "object"
      ? (item.encryptedAuth as Record<string, unknown>)
      : undefined;
  const alg =
    typeof encryptedAuth?.alg === "string" ? encryptedAuth.alg : undefined;
  const v = Number(encryptedAuth?.v);
  const iv =
    typeof encryptedAuth?.iv === "string" ? encryptedAuth.iv : undefined;
  const tag =
    typeof encryptedAuth?.tag === "string" ? encryptedAuth.tag : undefined;
  const ciphertext =
    typeof encryptedAuth?.ciphertext === "string"
      ? encryptedAuth.ciphertext
      : undefined;

  if (!alg || !Number.isFinite(v) || !iv || !tag || !ciphertext) {
    return undefined;
  }

  let auth;
  try {
    if (v !== 1) {
      return undefined;
    }
    auth = decryptAccountAuth(
      {
        alg: alg as EncryptedAccountAuthPayload["alg"],
        v: 1,
        iv,
        tag,
        ciphertext,
      },
      {
        accountId: id,
        exchangeId,
      },
    );
  } catch {
    return undefined;
  }

  return {
    id,
    name,
    exchangeId,
    status,
    auth,
    metadata:
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : undefined,
    createdAtMs,
    updatedAtMs,
  };
}

function fromLegacyAccountItem(
  item: Record<string, unknown>,
): AccountRecord | undefined {
  const id = typeof item.id === "string" ? item.id : undefined;
  const name = typeof item.name === "string" ? item.name : undefined;
  const exchangeId =
    typeof item.exchangeId === "string" ? item.exchangeId : undefined;
  const status =
    item.status === "active" || item.status === "archived"
      ? item.status
      : undefined;
  const createdAtMs = Number(item.createdAtMs);
  const updatedAtMs = Number(item.updatedAtMs);
  const auth =
    item.auth && typeof item.auth === "object"
      ? (item.auth as Record<string, unknown>)
      : undefined;
  const apiKey = typeof auth?.apiKey === "string" ? auth.apiKey : undefined;
  const apiSecret =
    typeof auth?.apiSecret === "string" ? auth.apiSecret : undefined;
  const apiPassphrase =
    typeof auth?.apiPassphrase === "string" ? auth.apiPassphrase : undefined;

  if (!id || !name || !exchangeId || !status) return undefined;
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(updatedAtMs))
    return undefined;
  if (!apiKey || !apiSecret) return undefined;

  return {
    id,
    name,
    exchangeId,
    status,
    auth: {
      apiKey,
      apiSecret,
      apiPassphrase,
    },
    metadata:
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : undefined,
    createdAtMs,
    updatedAtMs,
  };
}

function fromPositionItem(
  item: Record<string, unknown>,
): PositionRecord | undefined {
  const id = typeof item.id === "string" ? item.id : undefined;
  const botId = typeof item.botId === "string" ? item.botId : undefined;
  const botName = typeof item.botName === "string" ? item.botName : undefined;
  const strategyId =
    typeof item.strategyId === "string" ? item.strategyId : undefined;
  const strategyVersion =
    typeof item.strategyVersion === "string" ? item.strategyVersion : undefined;
  const exchangeId =
    typeof item.exchangeId === "string" ? item.exchangeId : undefined;
  const accountId =
    typeof item.accountId === "string" ? item.accountId : undefined;
  const symbol = typeof item.symbol === "string" ? item.symbol : undefined;
  const side =
    item.side === "long" || item.side === "short" ? item.side : undefined;
  const status = typeof item.status === "string" ? item.status : undefined;
  const quantity = Number(item.quantity);
  const remainingQuantity = Number(item.remainingQuantity);
  const realizedPnl = Number(item.realizedPnl);

  if (
    !id ||
    !botId ||
    !botName ||
    !strategyId ||
    !strategyVersion ||
    !exchangeId ||
    !accountId ||
    !symbol ||
    !side ||
    !status
  ) {
    return undefined;
  }
  if (![quantity, remainingQuantity, realizedPnl].every(Number.isFinite))
    return undefined;

  return {
    id,
    botId,
    botName,
    strategyId,
    strategyVersion,
    exchangeId,
    accountId,
    symbol,
    side,
    status: status as PositionRecord["status"],
    quantity,
    remainingQuantity,
    avgEntryPrice:
      typeof item.avgEntryPrice === "number" ? item.avgEntryPrice : undefined,
    stopPrice: typeof item.stopPrice === "number" ? item.stopPrice : undefined,
    realizedPnl,
    unrealizedPnl:
      typeof item.unrealizedPnl === "number" ? item.unrealizedPnl : undefined,
    openedAtMs:
      typeof item.openedAtMs === "number" ? item.openedAtMs : undefined,
    closedAtMs:
      typeof item.closedAtMs === "number" ? item.closedAtMs : undefined,
    lastStrategyDecisionTimeMs:
      typeof item.lastStrategyDecisionTimeMs === "number"
        ? item.lastStrategyDecisionTimeMs
        : undefined,
    lastExchangeSyncTimeMs:
      typeof item.lastExchangeSyncTimeMs === "number"
        ? item.lastExchangeSyncTimeMs
        : undefined,
    strategyContext:
      item.strategyContext && typeof item.strategyContext === "object"
        ? (item.strategyContext as Record<string, unknown>)
        : undefined,
  };
}

function fromOrderItem(item: Record<string, unknown>): OrderRecord | undefined {
  const id = typeof item.id === "string" ? item.id : undefined;
  const botId = typeof item.botId === "string" ? item.botId : undefined;
  const positionId =
    typeof item.positionId === "string" ? item.positionId : undefined;
  const symbol = typeof item.symbol === "string" ? item.symbol : undefined;
  const side =
    item.side === "long" || item.side === "short" ? item.side : undefined;
  const purpose =
    item.purpose === "entry" ||
    item.purpose === "reduce" ||
    item.purpose === "stop" ||
    item.purpose === "take-profit" ||
    item.purpose === "close" ||
    item.purpose === "reconcile"
      ? item.purpose
      : undefined;
  const status =
    item.status === "submitted" ||
    item.status === "filled" ||
    item.status === "canceled" ||
    item.status === "rejected"
      ? item.status
      : undefined;
  const createdAtMs = Number(item.createdAtMs);
  const updatedAtMs = Number(item.updatedAtMs);

  if (
    !id ||
    !botId ||
    !positionId ||
    !symbol ||
    !side ||
    !purpose ||
    !status ||
    !Number.isFinite(createdAtMs) ||
    !Number.isFinite(updatedAtMs)
  ) {
    return undefined;
  }

  const requestedQuantity = Number(item.requestedQuantity);
  const executedQuantity = Number(item.executedQuantity);
  const requestedPrice = Number(item.requestedPrice);
  const executedPrice = Number(item.executedPrice);

  return {
    id,
    botId,
    positionId,
    symbol,
    side,
    purpose,
    status,
    requestedPrice: Number.isFinite(requestedPrice)
      ? requestedPrice
      : undefined,
    executedPrice: Number.isFinite(executedPrice) ? executedPrice : undefined,
    requestedQuantity: Number.isFinite(requestedQuantity)
      ? requestedQuantity
      : undefined,
    requestedValueQty:
      typeof item.requestedValueQty === "string"
        ? item.requestedValueQty
        : undefined,
    executedQuantity: Number.isFinite(executedQuantity)
      ? executedQuantity
      : undefined,
    externalOrderId:
      typeof item.externalOrderId === "string"
        ? item.externalOrderId
        : undefined,
    clientOid: typeof item.clientOid === "string" ? item.clientOid : undefined,
    createdAtMs,
    updatedAtMs,
  };
}

function fromFillItem(item: Record<string, unknown>): FillRecord | undefined {
  const id = typeof item.id === "string" ? item.id : undefined;
  const botId = typeof item.botId === "string" ? item.botId : undefined;
  const positionId =
    typeof item.positionId === "string" ? item.positionId : undefined;
  const orderId = typeof item.orderId === "string" ? item.orderId : undefined;
  const symbol = typeof item.symbol === "string" ? item.symbol : undefined;
  const side =
    item.side === "long" || item.side === "short" ? item.side : undefined;
  const reason =
    item.reason === "entry" ||
    item.reason === "reduce" ||
    item.reason === "stop" ||
    item.reason === "take-profit" ||
    item.reason === "close" ||
    item.reason === "reconcile"
      ? item.reason
      : undefined;
  const source =
    item.source === "exchange-snapshot" || item.source === "synthetic"
      ? item.source
      : undefined;
  const quantity = Number(item.quantity);
  const price = Number(item.price);
  const createdAtMs = Number(item.createdAtMs);

  if (
    !id ||
    !botId ||
    !positionId ||
    !symbol ||
    !side ||
    !reason ||
    !source ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(createdAtMs)
  ) {
    return undefined;
  }

  return {
    id,
    botId,
    positionId,
    orderId,
    symbol,
    side,
    reason,
    source,
    price: Number.isFinite(price) ? price : undefined,
    quantity,
    createdAtMs,
  };
}

function fromReconciliationItem(
  item: Record<string, unknown>,
): ReconciliationEventRecord | undefined {
  const id = typeof item.id === "string" ? item.id : undefined;
  const botId = typeof item.botId === "string" ? item.botId : undefined;
  const positionId =
    typeof item.positionId === "string" ? item.positionId : undefined;
  const symbol = typeof item.symbol === "string" ? item.symbol : undefined;
  const status =
    item.status === "ok" || item.status === "drift" || item.status === "error"
      ? item.status
      : undefined;
  const message = typeof item.message === "string" ? item.message : undefined;
  const createdAtMs = Number(item.createdAtMs);

  if (
    !id ||
    !botId ||
    !symbol ||
    !status ||
    !message ||
    !Number.isFinite(createdAtMs)
  ) {
    return undefined;
  }

  return {
    id,
    botId,
    positionId,
    symbol,
    status,
    message,
    createdAtMs,
  };
}

async function queryItems(
  input: QueryCommandInput,
): Promise<Record<string, unknown>[]> {
  const client = getDocClient();
  const result = await client.send(new QueryCommand(input));
  return (result.Items ?? []) as Record<string, unknown>[];
}

async function queryRuns(input: QueryCommandInput): Promise<BotRunRecord[]> {
  const items = await queryItems(input);

  return items
    .map((item) => fromItem(item))
    .sort((a, b) => b.generatedAtMs - a.generatedAtMs);
}

async function queryBacktests(
  input: QueryCommandInput,
): Promise<BacktestRecord[]> {
  const items = await queryItems(input);

  return items
    .map((item) => fromBacktestItem(item))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

async function queryValidations(
  input: QueryCommandInput,
): Promise<RangeValidationRecord[]> {
  const items = await queryItems(input);

  return items
    .map((item) => fromValidationItem(item))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

async function queryBots(input: QueryCommandInput): Promise<BotRecord[]> {
  const items = await queryItems(input);
  return items
    .map((item) => fromBotItem(item))
    .filter((item): item is BotRecord => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function queryAccounts(
  input: Omit<QueryCommandInput, "TableName">,
): Promise<AccountRecord[]> {
  const tableName = getAccountsTableName();
  const items = await queryItems({
    ...input,
    TableName: tableName,
  });
  return items
    .map((item) => fromAccountItem(item))
    .filter((item): item is AccountRecord => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function queryLegacyAccounts(
  input: QueryCommandInput,
): Promise<AccountRecord[]> {
  const items = await queryItems(input);
  return items
    .map((item) => fromLegacyAccountItem(item))
    .filter((item): item is AccountRecord => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function queryPositions(
  input: QueryCommandInput,
): Promise<PositionRecord[]> {
  const items = await queryItems(input);
  return items
    .map((item) => fromPositionItem(item))
    .filter((item): item is PositionRecord => Boolean(item))
    .sort(
      (a, b) =>
        (b.lastExchangeSyncTimeMs ?? b.openedAtMs ?? 0) -
        (a.lastExchangeSyncTimeMs ?? a.openedAtMs ?? 0),
    );
}

async function queryOrders(input: QueryCommandInput): Promise<OrderRecord[]> {
  const items = await queryItems(input);
  return items
    .map((item) => fromOrderItem(item))
    .filter((item): item is OrderRecord => Boolean(item))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

async function queryFills(input: QueryCommandInput): Promise<FillRecord[]> {
  const items = await queryItems(input);
  return items
    .map((item) => fromFillItem(item))
    .filter((item): item is FillRecord => Boolean(item))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

async function queryReconciliations(
  input: QueryCommandInput,
): Promise<ReconciliationEventRecord[]> {
  const items = await queryItems(input);
  return items
    .map((item) => fromReconciliationItem(item))
    .filter((item): item is ReconciliationEventRecord => Boolean(item))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

async function migrateLegacyAccountIfNeeded(
  record: AccountRecord,
): Promise<void> {
  try {
    await putAccountRecord(record);
    await getDocClient().send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: {
          PK: accountPartitionKey(record.id),
          SK: accountSortKey(record.id),
        },
      }),
    );
  } catch (error) {
    console.warn("[store] failed to migrate legacy account to secure store", {
      accountId: record.id,
      exchangeId: record.exchangeId,
      error,
    });
  }
}

export async function putRunRecord(record: BotRunRecord): Promise<void> {
  const client = getDocClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toItem(record),
    }),
  );
}

export async function putBotRecord(record: BotRecord): Promise<void> {
  const client = getDocClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toBotItem(record),
    }),
  );
}

export async function putAccountRecord(record: AccountRecord): Promise<void> {
  const client = getDocClient();
  const tableName = getAccountsTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toAccountItem(record),
    }),
  );
}

export async function putPositionRecord(record: PositionRecord): Promise<void> {
  const client = getDocClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toPositionItem(record),
    }),
  );
}

export async function putOrderRecord(record: OrderRecord): Promise<void> {
  const client = getDocClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toOrderItem(record),
    }),
  );
}

export async function putFillRecord(record: FillRecord): Promise<void> {
  const client = getDocClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toFillItem(record),
    }),
  );
}

export async function putReconciliationEventRecord(
  record: ReconciliationEventRecord,
): Promise<void> {
  const client = getDocClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toReconciliationItem(record),
    }),
  );
}

export async function putBacktestRecord(record: BacktestRecord): Promise<void> {
  const client = getDocClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toBacktestItem(record),
    }),
  );
}

export async function putRangeValidationRecord(
  record: RangeValidationRecord,
): Promise<void> {
  const client = getDocClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toValidationItem(record),
    }),
  );
}

export async function getProcessingCursor(
  symbol: string,
  timeframe: ProcessingCursorRecord["timeframe"],
): Promise<ProcessingCursorRecord | undefined> {
  const tableName = getTableName();
  const client = getDocClient();

  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: PK_CURSOR,
        SK: cursorSortKey(symbol, timeframe),
      },
    }),
  );

  if (!result.Item) return undefined;
  return fromCursorItem(result.Item as Record<string, unknown>);
}

export async function advanceProcessingCursor(cursor: {
  symbol: string;
  timeframe: ProcessingCursorRecord["timeframe"];
  nextClosedCandleMs: number;
  generatedAtMs?: number;
  updatedAtMs?: number;
}): Promise<boolean> {
  const tableName = getTableName();
  const client = getDocClient();
  const updatedAtMs = cursor.updatedAtMs ?? Date.now();

  try {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          PK: PK_CURSOR,
          SK: cursorSortKey(cursor.symbol, cursor.timeframe),
        },
        UpdateExpression: [
          "SET symbol = :symbol",
          "timeframe = :timeframe",
          "lastProcessedCandleCloseMs = :next",
          "lastRunGeneratedAtMs = :generatedAt",
          "updatedAtMs = :updatedAt",
        ].join(", "),
        ConditionExpression:
          "attribute_not_exists(lastProcessedCandleCloseMs) OR lastProcessedCandleCloseMs < :next",
        ExpressionAttributeValues: {
          ":symbol": cursor.symbol,
          ":timeframe": cursor.timeframe,
          ":next": cursor.nextClosedCandleMs,
          ":generatedAt": cursor.generatedAtMs ?? cursor.nextClosedCandleMs,
          ":updatedAt": updatedAtMs,
        },
      }),
    );

    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "ConditionalCheckFailedException"
    ) {
      return false;
    }

    throw error;
  }
}

export async function listRecentRuns(limit?: number): Promise<BotRunRecord[]> {
  const tableName = getTableName();
  return queryRuns({
    TableName: tableName,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": PK_RUN,
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listBotRecords(limit?: number): Promise<BotRecord[]> {
  const tableName = getTableName();
  return queryBots({
    TableName: tableName,
    IndexName: GSI_BY_SYMBOL,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: {
      ":pk": "BOTDEF",
    },
    ScanIndexForward: true,
    Limit: normalizeLimit(limit),
  });
}

export async function listAccountRecords(
  limit?: number,
): Promise<AccountRecord[]> {
  const normalizedLimit = normalizeLimit(limit);
  const secureAccounts = await queryAccounts({
    IndexName: ACCOUNTS_GSI_BY_NAME,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: {
      ":pk": "ACCOUNTDEF",
    },
    ScanIndexForward: true,
    Limit: normalizedLimit,
  });
  const legacyAccounts = await queryLegacyAccounts({
    TableName: getTableName(),
    IndexName: GSI_BY_SYMBOL,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: {
      ":pk": "ACCOUNTDEF",
    },
    ScanIndexForward: true,
    Limit: normalizedLimit,
  });

  const merged = new Map(
    secureAccounts.map((account) => [account.id, account]),
  );
  for (const account of legacyAccounts) {
    if (!merged.has(account.id)) {
      merged.set(account.id, account);
      await migrateLegacyAccountIfNeeded(account);
    }
  }

  return [...merged.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, normalizedLimit);
}

export async function getAccountRecordById(
  accountId: string,
): Promise<AccountRecord | undefined> {
  const client = getDocClient();

  const secureResult = await client.send(
    new GetCommand({
      TableName: getAccountsTableName(),
      Key: {
        PK: accountPartitionKey(accountId),
        SK: accountSortKey(accountId),
      },
    }),
  );

  if (secureResult.Item) {
    return fromAccountItem(secureResult.Item as Record<string, unknown>);
  }

  const legacyResult = await client.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        PK: accountPartitionKey(accountId),
        SK: accountSortKey(accountId),
      },
    }),
  );

  if (!legacyResult.Item) return undefined;
  const legacy = fromLegacyAccountItem(
    legacyResult.Item as Record<string, unknown>,
  );
  if (legacy) {
    await migrateLegacyAccountIfNeeded(legacy);
  }
  return legacy;
}

export async function getBotRecordById(
  botId: string,
): Promise<BotRecord | undefined> {
  const tableName = getTableName();
  const client = getDocClient();

  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: botPartitionKey(botId),
        SK: botSortKey(botId),
      },
    }),
  );

  if (!result.Item) return undefined;
  return fromBotItem(result.Item as Record<string, unknown>);
}

export async function getBotRecordBySymbol(
  symbol: string,
): Promise<BotRecord | undefined> {
  const bots = await listBotRecords(MAX_LIMIT);
  return bots.find((bot) => bot.symbol === symbol);
}

export async function listPositionsByBot(
  botId: string,
  limit?: number,
): Promise<PositionRecord[]> {
  const tableName = getTableName();
  return queryPositions({
    TableName: tableName,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": botPartitionKey(botId),
      ":prefix": "POSITION#",
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listOrdersByBot(
  botId: string,
  limit?: number,
): Promise<OrderRecord[]> {
  const tableName = getTableName();
  return queryOrders({
    TableName: tableName,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": botPartitionKey(botId),
      ":prefix": "ORDER#",
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listFillsByBot(
  botId: string,
  limit?: number,
): Promise<FillRecord[]> {
  const tableName = getTableName();
  return queryFills({
    TableName: tableName,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": botPartitionKey(botId),
      ":prefix": "FILL#",
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listReconciliationEventsByBot(
  botId: string,
  limit?: number,
): Promise<ReconciliationEventRecord[]> {
  const tableName = getTableName();
  return queryReconciliations({
    TableName: tableName,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": botPartitionKey(botId),
      ":prefix": "RECON#",
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function getLatestOpenPositionByBot(
  botId: string,
): Promise<PositionRecord | undefined> {
  const positions = await listPositionsByBot(botId, MAX_LIMIT);
  return positions.find(
    (position) =>
      position.status === "open" ||
      position.status === "entry-pending" ||
      position.status === "reducing" ||
      position.status === "closing" ||
      position.status === "reconciling",
  );
}

export async function listRecentBacktests(
  limit?: number,
): Promise<BacktestRecord[]> {
  const tableName = getTableName();
  return queryBacktests({
    TableName: tableName,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": PK_BACKTEST,
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listRecentRangeValidations(
  limit?: number,
): Promise<RangeValidationRecord[]> {
  const tableName = getTableName();
  return queryValidations({
    TableName: tableName,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": PK_VALIDATION,
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listRecentBacktestsBySymbol(
  symbol: string,
  limit?: number,
): Promise<BacktestRecord[]> {
  const tableName = getTableName();

  return queryBacktests({
    TableName: tableName,
    IndexName: GSI_BY_SYMBOL,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `BACKTEST#${symbol}`,
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listRecentRangeValidationsBySymbol(
  symbol: string,
  limit?: number,
): Promise<RangeValidationRecord[]> {
  const tableName = getTableName();

  return queryValidations({
    TableName: tableName,
    IndexName: GSI_BY_SYMBOL,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `VALIDATION#${symbol}`,
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

function parseCreatedAtMsFromEntityId(id: string): number | undefined {
  const match = /-(\d{13})-[^-]+$/.exec(id);
  if (!match?.[1]) return undefined;

  const createdAtMs = Number(match[1]);
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return undefined;
  return createdAtMs;
}

export async function getBacktestById(
  id: string,
): Promise<BacktestRecord | undefined> {
  const createdAtMs = parseCreatedAtMsFromEntityId(id);
  if (!createdAtMs) return undefined;

  const tableName = getTableName();
  const client = getDocClient();

  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: PK_BACKTEST,
        SK: sortKey(createdAtMs, id),
      },
    }),
  );

  if (!result.Item) return undefined;
  return fromBacktestItem(result.Item as Record<string, unknown>);
}

export async function getRangeValidationById(
  id: string,
): Promise<RangeValidationRecord | undefined> {
  const createdAtMs = parseCreatedAtMsFromEntityId(id);
  if (!createdAtMs) return undefined;

  const tableName = getTableName();
  const client = getDocClient();

  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: PK_VALIDATION,
        SK: sortKey(createdAtMs, id),
      },
    }),
  );

  if (!result.Item) return undefined;
  return fromValidationItem(result.Item as Record<string, unknown>);
}

export async function listRecentRunsBySymbol(
  symbol: string,
  limit?: number,
): Promise<BotRunRecord[]> {
  const tableName = getTableName();

  return queryRuns({
    TableName: tableName,
    IndexName: GSI_BY_SYMBOL,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `BOT#${symbol}`,
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listLatestRunsBySymbols(
  symbols: string[],
): Promise<BotRunRecord[]> {
  const uniqueSymbols = [
    ...new Set(symbols.filter((symbol) => symbol.length > 0)),
  ];

  const results = await Promise.all(
    uniqueSymbols.map(async (symbol) => {
      const records = await listRecentRunsBySymbol(symbol, 1);
      return records[0];
    }),
  );

  return results
    .filter((record): record is BotRunRecord => Boolean(record))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export async function listLatestRunsByBotIds(
  botIds: string[],
): Promise<BotRunRecord[]> {
  const uniqueBotIds = [...new Set(botIds.filter((botId) => botId.length > 0))];
  const recent = await listRecentRuns(MAX_LIMIT);
  const byBotId = new Map<string, BotRunRecord>();

  for (const run of recent) {
    if (!uniqueBotIds.includes(run.botId) || byBotId.has(run.botId)) {
      continue;
    }
    byBotId.set(run.botId, run);
  }

  return uniqueBotIds
    .map((botId) => byBotId.get(botId))
    .filter((record): record is BotRunRecord => Boolean(record));
}

export async function listRecentBacktestsByBotId(
  botId: string,
  limit?: number,
): Promise<BacktestRecord[]> {
  const backtests = await listRecentBacktests(
    Math.max(normalizeLimit(limit), MAX_LIMIT),
  );
  return backtests
    .filter((backtest) => backtest.botId === botId)
    .slice(0, normalizeLimit(limit));
}

export async function listRecentRangeValidationsByBotId(
  botId: string,
  limit?: number,
): Promise<RangeValidationRecord[]> {
  const validations = await listRecentRangeValidations(
    Math.max(normalizeLimit(limit), MAX_LIMIT),
  );
  return validations
    .filter((validation) => validation.botId === botId)
    .slice(0, normalizeLimit(limit));
}

export async function getRunBySymbolAndTime(
  symbol: string,
  generatedAtMs: number,
): Promise<BotRunRecord | undefined> {
  const tableName = getTableName();

  const records = await queryRuns({
    TableName: tableName,
    IndexName: GSI_BY_SYMBOL,
    KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
    ExpressionAttributeValues: {
      ":pk": `BOT#${symbol}`,
      ":sk": gsiKey(generatedAtMs),
    },
    ScanIndexForward: false,
    Limit: 1,
  });

  return records[0];
}
