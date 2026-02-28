import type { EventBridgeEvent } from "aws-lambda";
import type { OrchestratorTimeframe } from "./contracts";
import {
  createFailedBacktestRecord,
  createRunningBacktestRecord,
  runBacktestJob,
  type BacktestIdentity,
  type CreateBacktestInput,
} from "./monitoring/backtests";
import {
  BACKTEST_EVENT_DETAIL_TYPE_REQUESTED,
  BACKTEST_EVENT_SOURCE,
  type BacktestRequestedDetail,
} from "./monitoring/backtest-events";
import { getBacktestById, putBacktestRecord } from "./monitoring/store";
import type { BacktestAiConfig } from "./monitoring/types";

function isTimeframe(value: unknown): value is OrchestratorTimeframe {
  return (
    value === "1m" ||
    value === "3m" ||
    value === "5m" ||
    value === "15m" ||
    value === "30m" ||
    value === "1h" ||
    value === "2h" ||
    value === "4h" ||
    value === "6h" ||
    value === "8h" ||
    value === "12h" ||
    value === "1d" ||
    value === "1w"
  );
}

function parseRequestedDetail(raw: unknown): BacktestRequestedDetail | undefined {
  const detail =
    typeof raw === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(raw) as unknown;
            return parsed && typeof parsed === "object"
              ? (parsed as Record<string, unknown>)
              : undefined;
          } catch {
            return undefined;
          }
        })()
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : undefined;
  if (!detail) return undefined;

  const backtestId =
    typeof detail.backtestId === "string" ? detail.backtestId.trim() : "";
  const botId = typeof detail.botId === "string" ? detail.botId.trim() : "";
  const botName = typeof detail.botName === "string" ? detail.botName.trim() : "";
  const strategyId = typeof detail.strategyId === "string" ? detail.strategyId.trim() : "";
  const strategyVersion = typeof detail.strategyVersion === "string" ? detail.strategyVersion.trim() : "";
  const exchangeId = typeof detail.exchangeId === "string" ? detail.exchangeId.trim() : "";
  const accountId = typeof detail.accountId === "string" ? detail.accountId.trim() : "";
  const symbol = typeof detail.symbol === "string" ? detail.symbol.trim() : "";
  const createdAtMs = Number(detail.createdAtMs);
  const fromMs = Number(detail.fromMs);
  const toMs = Number(detail.toMs);
  const initialEquity = Number(detail.initialEquity);

  const executionTimeframe = detail.executionTimeframe;
  const primaryRangeTimeframe = detail.primaryRangeTimeframe;
  const secondaryRangeTimeframe = detail.secondaryRangeTimeframe;
  const aiRaw = detail.ai;

  if (!backtestId || !botId || !botName || !strategyId || !strategyVersion || !exchangeId || !accountId || !symbol) return undefined;
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return undefined;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    return undefined;
  }
  if (!Number.isFinite(initialEquity) || initialEquity <= 0) return undefined;
  if (!isTimeframe(executionTimeframe)) return undefined;
  if (!isTimeframe(primaryRangeTimeframe)) return undefined;
  if (!isTimeframe(secondaryRangeTimeframe)) return undefined;

  let ai: BacktestAiConfig | undefined;
  if (aiRaw !== undefined) {
    if (!aiRaw || typeof aiRaw !== "object") return undefined;
    const row = aiRaw as Record<string, unknown>;

    const enabled = row.enabled;
    const lookbackCandles = Number(row.lookbackCandles);
    const cadenceBars = Number(row.cadenceBars);
    const maxEvaluations = Number(row.maxEvaluations);
    const confidenceThreshold = Number(row.confidenceThreshold);
    const modelPrimary =
      typeof row.modelPrimary === "string" ? row.modelPrimary.trim() : "";
    const modelFallback =
      typeof row.modelFallback === "string" ? row.modelFallback.trim() : "";

    if (typeof enabled !== "boolean") return undefined;
    if (enabled) {
      if (!Number.isFinite(lookbackCandles) || lookbackCandles <= 0) return undefined;
      if (!Number.isFinite(cadenceBars) || cadenceBars <= 0) return undefined;
      if (!Number.isFinite(maxEvaluations) || maxEvaluations <= 0) return undefined;
      if (!Number.isFinite(confidenceThreshold)) return undefined;
      if (!modelPrimary || !modelFallback) return undefined;
    }

    ai = {
      enabled,
      lookbackCandles: Number.isFinite(lookbackCandles) ? Math.floor(lookbackCandles) : 240,
      cadenceBars: Number.isFinite(cadenceBars) ? Math.floor(cadenceBars) : 1,
      maxEvaluations: Number.isFinite(maxEvaluations) ? Math.floor(maxEvaluations) : 50,
      confidenceThreshold: Number.isFinite(confidenceThreshold) ? confidenceThreshold : 0.72,
      modelPrimary: modelPrimary || "gpt-5-nano-2025-08-07",
      modelFallback: modelFallback || "gpt-5-mini-2025-08-07",
    };
  }

  return {
    backtestId,
    createdAtMs: Math.floor(createdAtMs),
    botId,
    botName,
    strategyId,
    strategyVersion,
    exchangeId,
    accountId,
    symbol,
    fromMs: Math.floor(fromMs),
    toMs: Math.floor(toMs),
    executionTimeframe,
    primaryRangeTimeframe,
    secondaryRangeTimeframe,
    initialEquity,
    ai,
  };
}

function extractBacktestId(raw: unknown): string | undefined {
  const row =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : undefined;
  const id = row?.backtestId;
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : undefined;
}

function toCreateBacktestInput(detail: BacktestRequestedDetail): CreateBacktestInput {
  return {
    botId: detail.botId,
    botName: detail.botName,
    strategyId: detail.strategyId,
    strategyVersion: detail.strategyVersion,
    exchangeId: detail.exchangeId,
    accountId: detail.accountId,
    symbol: detail.symbol,
    fromMs: detail.fromMs,
    toMs: detail.toMs,
    executionTimeframe: detail.executionTimeframe,
    primaryRangeTimeframe: detail.primaryRangeTimeframe,
    secondaryRangeTimeframe: detail.secondaryRangeTimeframe,
    initialEquity: detail.initialEquity,
    ai: detail.ai,
  };
}

export async function handler(
  event: EventBridgeEvent<string, BacktestRequestedDetail>,
): Promise<void> {
  console.log("[backtest-worker] event received", {
    id: event.id,
    source: event.source,
    detailType: event["detail-type"],
  });

  if (
    event.source !== BACKTEST_EVENT_SOURCE ||
    event["detail-type"] !== BACKTEST_EVENT_DETAIL_TYPE_REQUESTED
  ) {
    return;
  }

  const detail = parseRequestedDetail(event.detail);
  if (!detail) {
    const fallbackBacktestId = extractBacktestId(event.detail);
    console.error("[backtest-worker] invalid detail payload", {
      id: event.id,
      detailType: event["detail-type"],
      source: event.source,
      fallbackBacktestId,
      detail: event.detail,
    });

    if (fallbackBacktestId) {
      try {
        const existing = await getBacktestById(fallbackBacktestId);
        if (existing && existing.status === "running") {
          await putBacktestRecord({
            ...existing,
            status: "failed",
            errorMessage:
              "Invalid backtest event payload. Check backtest-worker logs for details.",
          });
        }
      } catch (error) {
        console.error("[backtest-worker] failed to persist invalid payload failure", {
          fallbackBacktestId,
          error,
        });
      }
    }

    return;
  }

  const input = toCreateBacktestInput(detail);
  const identity: BacktestIdentity = {
    backtestId: detail.backtestId,
    createdAtMs: detail.createdAtMs,
  };

  try {
    console.log("[backtest-worker] processing started", {
      backtestId: detail.backtestId,
      symbol: detail.symbol,
      executionTimeframe: detail.executionTimeframe,
      fromMs: detail.fromMs,
      toMs: detail.toMs,
      aiEnabled: detail.ai?.enabled ?? false,
    });

    const existing = await getBacktestById(detail.backtestId);
    if (existing?.status === "completed") {
      console.log("[backtest-worker] skipping completed backtest", {
        backtestId: detail.backtestId,
      });
      return;
    }

    let runningRecord = existing && existing.status === "running"
      ? existing
      : createRunningBacktestRecord(input, identity);

    if (!existing || existing.status !== "running") {
      await putBacktestRecord(runningRecord);
    }

    const result = await runBacktestJob(input, identity, {
      onAiProgress: async (summary) => {
        if (runningRecord.status !== "running") return;
        runningRecord = {
          ...runningRecord,
          ai: summary,
        };
        await putBacktestRecord(runningRecord);
      },
    });
    await putBacktestRecord(result);
    console.log("[backtest-worker] processing finished", {
      backtestId: detail.backtestId,
      symbol: detail.symbol,
      status: result.status,
      totalTrades: result.totalTrades,
      netPnl: result.netPnl,
      aiEnabled: result.ai?.enabled ?? false,
      aiEvaluations: result.ai?.evaluationsRun,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error("[backtest-worker] execution failed", {
      backtestId: detail.backtestId,
      symbol: detail.symbol,
      error,
    });

    try {
      await putBacktestRecord(
        createFailedBacktestRecord(input, identity, message),
      );
    } catch (persistError) {
      console.error("[backtest-worker] failed to persist error state", {
        backtestId: detail.backtestId,
        symbol: detail.symbol,
        persistError,
      });
    }
  }
}
