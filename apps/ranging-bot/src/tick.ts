import { createKucoinClient, createKucoinService } from "@repo/kucoin";
import { createKucoinOrchestrator } from "./exchanges/kucoin/orchestrator";
import type { OrchestratorRunInput } from "./contracts";
import { publishRunRecord, publishTickSummary } from "./monitoring/realtime";
import { putRunRecord } from "./monitoring/store";
import type { BotRunRecord } from "./monitoring/types";
import {
  getClosedCandleEndTime,
  parseBotConfigs,
  toBoolean,
  type RuntimeBotConfig,
} from "./runtime-config";

let cachedService: ReturnType<typeof createKucoinService> | null = null;
let cachedClient: ReturnType<typeof createKucoinClient> | null = null;

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

    return parsed.filter((symbol): symbol is string => typeof symbol === "string" && symbol.length > 0);
  } catch {
    return raw
      .split(",")
      .map((symbol) => symbol.trim())
      .filter((symbol) => symbol.length > 0);
  }
}

function buildDefaultBotConfig(symbol: string): RuntimeBotConfig {
  return {
    symbol,
    executionTimeframe: "15m",
    primaryRangeTimeframe: "1d",
    secondaryRangeTimeframe: "4h",
    executionLimit: 240,
    primaryRangeLimit: 90,
    secondaryRangeLimit: 180,
    enabled: true,
  };
}

function getKucoinService() {
  if (cachedService && cachedClient) {
    return { client: cachedClient, service: cachedService };
  }

  const apiKey = process.env.KUCOIN_API_KEY;
  const apiSecret = process.env.KUCOIN_API_SECRET;
  const passphrase = process.env.KUCOIN_API_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error(
      "Missing KuCoin credentials. Set KUCOIN_API_KEY, KUCOIN_API_SECRET and KUCOIN_API_PASSPHRASE",
    );
  }

  cachedClient = createKucoinClient({
    apiKey,
    apiSecret,
    passphrase,
  });
  cachedService = createKucoinService(cachedClient);

  return {
    client: cachedClient,
    service: cachedService,
  };
}

function toRunInput(config: RuntimeBotConfig, nowMs: number): OrchestratorRunInput {
  return {
    symbol: config.symbol,
    executionTimeframe: config.executionTimeframe,
    primaryRangeTimeframe: config.primaryRangeTimeframe,
    secondaryRangeTimeframe: config.secondaryRangeTimeframe,
    executionLimit: config.executionLimit,
    primaryRangeLimit: config.primaryRangeLimit,
    secondaryRangeLimit: config.secondaryRangeLimit,
    endTimeMs: getClosedCandleEndTime(nowMs, config.executionTimeframe),
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

function toRunRecord(config: RuntimeBotConfig, runInput: OrchestratorRunInput, event: Awaited<ReturnType<ReturnType<typeof createKucoinOrchestrator>["runOnce"]>>): BotRunRecord {
  const processing = event.processing ?? {
    status: event.decision.signal ? "error" : "no-signal",
    side: event.decision.signal ?? undefined,
    message: "Missing processing result",
  };

  return {
    symbol: config.symbol,
    generatedAtMs: event.generatedAtMs,
    recordedAtMs: Date.now(),
    runStatus: processing.status === "error" ? "failed" : "ok",
    executionTimeframe: runInput.executionTimeframe,
    primaryRangeTimeframe: runInput.primaryRangeTimeframe,
    secondaryRangeTimeframe: runInput.secondaryRangeTimeframe,
    signal: event.decision.signal,
    reasons: event.decision.reasons,
    price: event.snapshot.price,
    rangeVal: event.snapshot.range.effective.val,
    rangeVah: event.snapshot.range.effective.vah,
    rangePoc: event.snapshot.range.effective.poc,
    rangeIsAligned: event.snapshot.range.isAligned,
    rangeOverlapRatio: event.snapshot.range.overlapRatio,
    bullishDivergence: event.snapshot.bullishDivergence,
    bearishDivergence: event.snapshot.bearishDivergence,
    bullishSfp: event.snapshot.bullishSfp,
    bearishSfp: event.snapshot.bearishSfp,
    moneyFlowSlope: event.snapshot.moneyFlowSlope,
    processing,
  };
}

function toFailedRunRecord(config: RuntimeBotConfig, runInput: OrchestratorRunInput, error: unknown): BotRunRecord {
  const message = toErrorMessage(error);
  const recordedAtMs = Date.now();

  return {
    symbol: config.symbol,
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

async function persistAndBroadcast(record: BotRunRecord): Promise<void> {
  await Promise.allSettled([putRunRecord(record), publishRunRecord(record)]);
}

export const handler = async (incomingEvent?: CronTickEvent) => {
  const nowMs = Date.now();
  const event = asObject(incomingEvent);

  const eventSymbols = parseSymbols(event.symbols);
  const eventBotsJson = typeof event.botsJson === "string" ? event.botsJson : undefined;

  const envDryRun = toBoolean(process.env.RANGING_DRY_RUN, true);
  const globalDryRun =
    typeof event.dryRun === "string" ? toBoolean(event.dryRun, envDryRun) : envDryRun;

  const envMarginMode = process.env.RANGING_MARGIN_MODE === "ISOLATED" ? "ISOLATED" : "CROSS";
  const globalMarginMode =
    event.marginMode === "ISOLATED" || event.marginMode === "CROSS"
      ? event.marginMode
      : envMarginMode;
  const globalValueQty =
    typeof event.valueQty === "string" && event.valueQty.length > 0
      ? event.valueQty
      : (process.env.RANGING_VALUE_QTY ?? "100");

  const parsedFromEnvOrEvent = parseBotConfigs(eventBotsJson ?? process.env.RANGING_BOTS_JSON)
    .filter((config) => config.enabled !== false);

  let configs = parsedFromEnvOrEvent;
  if (eventSymbols.length > 0) {
    const selected = new Set(eventSymbols);
    configs = parsedFromEnvOrEvent.filter((config) => selected.has(config.symbol));

    if (configs.length === 0) {
      configs = eventSymbols.map(buildDefaultBotConfig);
    }
  }

  if (configs.length === 0) {
    console.warn("[ranging-tick] No enabled bot configs. Set RANGING_BOTS_JSON or pass event.symbols.");
    const emptySummary = {
      processed: 0,
      signaled: 0,
      failed: 0,
      total: 0,
      dryRun: globalDryRun,
      symbolFilterCount: eventSymbols.length,
    };
    await publishTickSummary(emptySummary);
    return emptySummary;
  }

  const { client, service } = getKucoinService();

  let processed = 0;
  let signaled = 0;
  let failed = 0;

  for (const config of configs) {
    const runInput = toRunInput(config, nowMs);

    try {
      const instance = createKucoinOrchestrator({
        client,
        service,
        strategyConfig: config.strategyConfig,
        signalProcessorOptions: {
          dryRun: config.dryRun ?? globalDryRun,
          marginMode: config.marginMode ?? globalMarginMode,
          valueQty: config.valueQty ?? globalValueQty,
        },
      });

      const event = await instance.runOnce(runInput);
      processed += 1;

      if (event.decision.signal) {
        signaled += 1;
      }

      const runRecord = toRunRecord(config, runInput, event);
      await persistAndBroadcast(runRecord);

      console.log("[ranging-tick] run", {
        symbol: config.symbol,
        signal: event.decision.signal,
        reasons: event.decision.reasons,
        generatedAtMs: event.generatedAtMs,
        endTimeMs: runInput.endTimeMs,
        processing: event.processing,
      });
    } catch (error) {
      failed += 1;
      const failedRecord = toFailedRunRecord(config, runInput, error);
      await persistAndBroadcast(failedRecord);
      console.error("[ranging-tick] run failed", {
        symbol: config.symbol,
        error,
      });
    }
  }

  const summary = {
    processed,
    signaled,
    failed,
    total: configs.length,
    dryRun: globalDryRun,
    symbolFilterCount: eventSymbols.length,
  };

  console.log("[ranging-tick] summary", summary);
  await publishTickSummary(summary);
  return summary;
};

export const internals = {
  parseBotConfigs,
  getClosedCandleEndTime,
};
