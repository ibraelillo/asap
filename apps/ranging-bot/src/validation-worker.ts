import type { EventBridgeEvent } from "aws-lambda";
import { computeVolumeProfileLevels, type Candle } from "@repo/ranging-core";
import type { OrchestratorTimeframe } from "./contracts";
import { fetchHistoricalKlines } from "./monitoring/kucoin-public-klines";
import {
  getRangeValidationById,
  putRangeValidationRecord,
} from "./monitoring/store";
import type {
  RangeValidationRecord,
  RangeValidationResult,
} from "./monitoring/types";
import { getRuntimeSettings } from "./runtime-settings";
import {
  RANGE_VALIDATION_EVENT_DETAIL_TYPE_REQUESTED,
  RANGE_VALIDATION_EVENT_SOURCE,
  type RangeValidationRequestedDetail,
} from "./monitoring/validation-events";
import {
  createCompletedValidationRecord,
  createFailedValidationRecord,
  createPendingValidationRecord,
  type CreateValidationInput,
  type ValidationIdentity,
} from "./monitoring/validations";
import { getOpenAiApiKey } from "./openai-secret";

const MIN_REQUIRED_CANDLES = 60;

const SYSTEM_PROMPT = [
  "You are a trading range validator for crypto futures.",
  "Determine if the provided candles are currently in a ranging regime.",
  "Return only valid JSON with this schema:",
  '{"isRanging":boolean,"confidence":number,"timeframeDetected":"1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|1w|unknown","range":{"val":number,"poc":number,"vah":number},"reasons":string[]}',
  "Rules:",
  "- confidence must be in [0,1].",
  "- if not ranging, still provide best estimated range levels.",
  "- keep reasons short and machine-friendly snake_case.",
].join("\n");

const timeframeSet = new Set<OrchestratorTimeframe>([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "1w",
]);

function getValidationDefaults() {
  const runtimeSettings = getRuntimeSettings();
  return {
    endpoint: runtimeSettings.openAiResponsesEndpoint,
    primaryModel: runtimeSettings.validationModelPrimary,
    fallbackModel: runtimeSettings.validationModelFallback,
    confidenceThreshold: runtimeSettings.validationConfidenceThreshold,
    maxOutputTokens: runtimeSettings.validationMaxOutputTokens,
    timeoutMs: runtimeSettings.validationTimeoutMs,
  };
}

function isTimeframe(value: unknown): value is OrchestratorTimeframe {
  return (
    typeof value === "string" &&
    timeframeSet.has(value as OrchestratorTimeframe)
  );
}

function parseRequestedDetail(
  raw: unknown,
): RangeValidationRequestedDetail | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const detail = raw as Record<string, unknown>;

  const validationId =
    typeof detail.validationId === "string" ? detail.validationId.trim() : "";
  const botId = typeof detail.botId === "string" ? detail.botId.trim() : "";
  const deploymentId =
    typeof detail.deploymentId === "string" ? detail.deploymentId.trim() : "";
  const botName =
    typeof detail.botName === "string" ? detail.botName.trim() : "";
  const strategyId =
    typeof detail.strategyId === "string" ? detail.strategyId.trim() : "";
  const symbol = typeof detail.symbol === "string" ? detail.symbol.trim() : "";
  const createdAtMs = Number(detail.createdAtMs);
  const fromMs = Number(detail.fromMs);
  const toMs = Number(detail.toMs);
  const candlesCount = Number(detail.candlesCount);
  const timeframe = detail.timeframe;

  if (!validationId || !botId || !deploymentId || !botName || !strategyId || !symbol)
    return undefined;
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return undefined;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    return undefined;
  }
  if (!Number.isFinite(candlesCount) || candlesCount <= 0) return undefined;
  if (!isTimeframe(timeframe)) return undefined;

  return {
    validationId,
    createdAtMs: Math.floor(createdAtMs),
    botId,
    deploymentId,
    botName,
    strategyId,
    symbol,
    timeframe,
    fromMs: Math.floor(fromMs),
    toMs: Math.floor(toMs),
    candlesCount: Math.floor(candlesCount),
  };
}

function buildCreateInput(
  detail: RangeValidationRequestedDetail,
): CreateValidationInput {
  const defaults = getValidationDefaults();
  return {
    botId: detail.botId,
    deploymentId: detail.deploymentId,
    botName: detail.botName,
    strategyId: detail.strategyId,
    symbol: detail.symbol,
    timeframe: detail.timeframe,
    fromMs: detail.fromMs,
    toMs: detail.toMs,
    candlesCount: detail.candlesCount,
    modelPrimary: defaults.primaryModel,
    modelFallback: defaults.fallbackModel,
    confidenceThreshold:
      Number.isFinite(defaults.confidenceThreshold) &&
      defaults.confidenceThreshold > 0
        ? Math.min(defaults.confidenceThreshold, 1)
        : 0.72,
  };
}

function defaultRange(candles: Candle[]) {
  const levels = computeVolumeProfileLevels(candles);
  return {
    val: levels.val,
    poc: levels.poc,
    vah: levels.vah,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeRange(
  val: number,
  poc: number,
  vah: number,
): {
  val: number;
  poc: number;
  vah: number;
} {
  const sorted = [val, poc, vah].sort((a, b) => a - b);
  return {
    val: sorted[0] ?? val,
    poc: sorted[1] ?? poc,
    vah: sorted[2] ?? vah,
  };
}

function extractOutputText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const root = payload as Record<string, unknown>;

  if (
    typeof root.output_text === "string" &&
    root.output_text.trim().length > 0
  ) {
    return root.output_text;
  }

  const output = root.output;
  if (!Array.isArray(output)) return undefined;

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue;
      const row = contentItem as Record<string, unknown>;
      const text = row.text;
      if (typeof text === "string" && text.trim().length > 0) {
        parts.push(text);
      }
      if (
        text &&
        typeof text === "object" &&
        typeof (text as { value?: unknown }).value === "string" &&
        (text as { value: string }).value.trim().length > 0
      ) {
        parts.push((text as { value: string }).value);
      }
      if (
        typeof row.output_text === "string" &&
        row.output_text.trim().length > 0
      ) {
        parts.push(row.output_text);
      }
      if (
        row.type === "output_json" &&
        row.json &&
        typeof row.json === "object"
      ) {
        parts.push(JSON.stringify(row.json));
      }
    }
  }

  if (parts.length === 0) return undefined;
  return parts.join("\n");
}

function detectMissingOutputReason(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "unknown_response_shape";
  const root = payload as Record<string, unknown>;
  const status = typeof root.status === "string" ? root.status : "unknown";
  const incompleteDetails = root.incomplete_details;
  let reason = "";
  if (incompleteDetails && typeof incompleteDetails === "object") {
    const row = incompleteDetails as Record<string, unknown>;
    const rawReason = row.reason;
    if (typeof rawReason === "string" && rawReason.length > 0) {
      reason = rawReason;
    }
  }
  return reason.length > 0 ? `${status}:${reason}` : status;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
    if (!fenced?.[1]) {
      const genericFence = raw.match(/```\s*([\s\S]*?)```/);
      if (!genericFence?.[1]) return undefined;
      try {
        return JSON.parse(genericFence[1]) as unknown;
      } catch {
        return undefined;
      }
    }

    try {
      return JSON.parse(fenced[1]) as unknown;
    } catch {
      return undefined;
    }
  }
}

function normalizeValidationResult(
  raw: unknown,
  candles: Candle[],
): RangeValidationResult {
  const fallback = defaultRange(candles);
  const root =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawRange =
    root.range && typeof root.range === "object"
      ? (root.range as Record<string, unknown>)
      : {};
  const reasons = Array.isArray(root.reasons)
    ? root.reasons.filter((value): value is string => typeof value === "string")
    : [];

  const isRanging =
    typeof root.isRanging === "boolean" ? root.isRanging : false;
  const confidenceRaw = Number(root.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? clamp(confidenceRaw, 0, 1)
    : 0;
  const detected = root.timeframeDetected;
  const timeframeDetected =
    typeof detected === "string" && isTimeframe(detected)
      ? detected
      : detected === "unknown"
        ? "unknown"
        : "unknown";

  const valRaw = Number(rawRange.val);
  const pocRaw = Number(rawRange.poc);
  const vahRaw = Number(rawRange.vah);
  const normalizedRange = sanitizeRange(
    Number.isFinite(valRaw) ? valRaw : fallback.val,
    Number.isFinite(pocRaw) ? pocRaw : fallback.poc,
    Number.isFinite(vahRaw) ? vahRaw : fallback.vah,
  );

  return {
    isRanging,
    confidence,
    timeframeDetected,
    range: normalizedRange,
    reasons,
  };
}

function summarizeCandles(candles: Candle[]) {
  const first = candles[0];
  const last = candles[candles.length - 1];
  const minLow = candles.reduce(
    (acc, candle) => Math.min(acc, candle.low),
    Number.POSITIVE_INFINITY,
  );
  const maxHigh = candles.reduce(
    (acc, candle) => Math.max(acc, candle.high),
    Number.NEGATIVE_INFINITY,
  );
  const avgVolume =
    candles.reduce((acc, candle) => acc + candle.volume, 0) /
    Math.max(candles.length, 1);

  const fallbackClose = last?.close ?? first?.close ?? 1;
  const width =
    Number.isFinite(maxHigh) && Number.isFinite(minLow) ? maxHigh - minLow : 0;
  const widthPct = fallbackClose > 0 ? width / fallbackClose : 0;

  return {
    count: candles.length,
    startTime: first?.time,
    endTime: last?.time,
    minLow,
    maxHigh,
    width,
    widthPct,
    avgVolume,
  };
}

function buildPromptPayload(
  detail: RangeValidationRequestedDetail,
  candles: Candle[],
) {
  const candidate = defaultRange(candles);
  const summary = summarizeCandles(candles);

  return {
    symbol: detail.symbol,
    timeframe: detail.timeframe,
    fromMs: detail.fromMs,
    toMs: detail.toMs,
    summary,
    deterministicCandidate: candidate,
    candles: candles.map((candle) => [
      candle.time,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ]),
  };
}

async function callOpenAiModel(
  model: string,
  detail: RangeValidationRequestedDetail,
  candles: Candle[],
  maxOutputTokensOverride?: number,
): Promise<RangeValidationResult> {
  const apiKey = getOpenAiApiKey();
  const defaults = getValidationDefaults();

  const payload = buildPromptPayload(detail, candles);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), defaults.timeoutMs);

  try {
    const response = await fetch(defaults.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify(payload),
          },
        ],
        reasoning: {
          effort: "minimal",
        },
        text: {
          verbosity: "low",
        },
        max_output_tokens:
          Number.isFinite(maxOutputTokensOverride) &&
          maxOutputTokensOverride &&
          maxOutputTokensOverride > 0
            ? Math.floor(maxOutputTokensOverride)
            : Number.isFinite(defaults.maxOutputTokens) &&
                defaults.maxOutputTokens > 0
              ? Math.floor(defaults.maxOutputTokens)
              : 800,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI responses request failed (${response.status}): ${errorBody.slice(0, 512)}`,
      );
    }

    const responseJson = (await response.json()) as unknown;
    const outputText = extractOutputText(responseJson);
    if (!outputText) {
      const reason = detectMissingOutputReason(responseJson);
      throw new Error(
        `OpenAI response did not include assistant text (${reason})`,
      );
    }

    const parsed = safeJsonParse(outputText);
    if (!parsed) {
      throw new Error("OpenAI output was not valid JSON");
    }

    return normalizeValidationResult(parsed, candles);
  } finally {
    clearTimeout(timeout);
  }
}

async function runValidationWithFallback(
  detail: RangeValidationRequestedDetail,
  record: RangeValidationRecord,
  candles: Candle[],
): Promise<{ result: RangeValidationResult; finalModel: string }> {
  const defaults = getValidationDefaults();
  const primaryBudget =
    Number.isFinite(defaults.maxOutputTokens) && defaults.maxOutputTokens > 0
      ? Math.floor(defaults.maxOutputTokens)
      : 800;
  const retryBudget = Math.min(primaryBudget * 2, 2_000);

  let primary: RangeValidationResult | undefined;
  let primaryError: unknown;
  try {
    primary = await callOpenAiModel(
      record.modelPrimary,
      detail,
      candles,
      primaryBudget,
    );
  } catch (error) {
    primaryError = error;
    try {
      primary = await callOpenAiModel(
        record.modelPrimary,
        detail,
        candles,
        retryBudget,
      );
      primaryError = undefined;
    } catch (retryError) {
      primaryError = retryError;
    }
  }

  if (primary && primary.confidence >= record.confidenceThreshold) {
    return {
      result: primary,
      finalModel: record.modelPrimary,
    };
  }

  let fallback: RangeValidationResult | undefined;
  let fallbackError: unknown;
  try {
    fallback = await callOpenAiModel(
      record.modelFallback,
      detail,
      candles,
      retryBudget,
    );
  } catch (error) {
    fallbackError = error;
  }

  if (fallback && (!primary || fallback.confidence >= primary.confidence)) {
    return {
      result: fallback,
      finalModel: record.modelFallback,
    };
  }

  if (primary) {
    return {
      result: primary,
      finalModel: record.modelPrimary,
    };
  }

  const primaryMessage =
    primaryError instanceof Error ? primaryError.message : String(primaryError);
  const fallbackMessage =
    fallbackError instanceof Error
      ? fallbackError.message
      : String(fallbackError);
  throw new Error(
    `Validation failed on both models. Primary: ${primaryMessage}. Fallback: ${fallbackMessage}`,
  );
}

export async function handler(
  event: EventBridgeEvent<string, RangeValidationRequestedDetail>,
): Promise<void> {
  if (
    event.source !== RANGE_VALIDATION_EVENT_SOURCE ||
    event["detail-type"] !== RANGE_VALIDATION_EVENT_DETAIL_TYPE_REQUESTED
  ) {
    return;
  }

  const detail = parseRequestedDetail(event.detail);
  if (!detail) {
    console.error("[validation-worker] invalid event detail", {
      id: event.id,
      source: event.source,
      detailType: event["detail-type"],
    });
    return;
  }

  const input = buildCreateInput(detail);
  const identity: ValidationIdentity = {
    validationId: detail.validationId,
    createdAtMs: detail.createdAtMs,
  };

  let record = await getRangeValidationById(detail.validationId);
  if (record?.status === "completed") {
    return;
  }

  if (!record) {
    record = createPendingValidationRecord(input, identity);
    await putRangeValidationRecord(record);
  }

  try {
    const candles = await fetchHistoricalKlines({
      symbol: detail.symbol,
      timeframe: detail.timeframe,
      fromMs: detail.fromMs,
      toMs: detail.toMs,
    });

    if (candles.length < MIN_REQUIRED_CANDLES) {
      throw new Error(
        `Not enough candles for validation (${candles.length} < ${MIN_REQUIRED_CANDLES})`,
      );
    }

    const { result, finalModel } = await runValidationWithFallback(
      detail,
      record,
      candles,
    );

    await putRangeValidationRecord(
      createCompletedValidationRecord(record, result, finalModel),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[validation-worker] failed", {
      validationId: detail.validationId,
      symbol: detail.symbol,
      timeframe: detail.timeframe,
      error,
    });

    try {
      await putRangeValidationRecord(
        createFailedValidationRecord(record, message),
      );
    } catch (persistError) {
      console.error("[validation-worker] failed to persist error state", {
        validationId: detail.validationId,
        symbol: detail.symbol,
        persistError,
      });
    }
  }
}
