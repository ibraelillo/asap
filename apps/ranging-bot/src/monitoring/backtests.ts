import {
  computeVolumeProfileLevels,
  createRangingBot,
  type BacktestCandle,
  type BacktestResult,
  type BacktestTrade,
  type Candle,
  type DeepPartial,
  type RangeReversalConfig,
} from "@repo/ranging-core";
import type { OrchestratorTimeframe } from "../contracts";
import { fetchHistoricalKlines } from "./kucoin-public-klines";
import {
  buildWindowKlineCacheKey,
  findMatchingKlineRef,
  loadCandlesFromCacheKey,
  loadCandlesFromCacheRef,
  normalizeKlineReference,
  saveBacktestKlineCache,
} from "./kline-cache";
import type {
  BacktestAiConfig,
  BacktestAiEvaluation,
  BacktestAiSummary,
  BacktestRecord,
  BacktestTradeView,
  KlineCacheReference,
  RangeValidationResult,
} from "./types";

const OPENAI_ENDPOINT = process.env.OPENAI_RESPONSES_ENDPOINT
  ?? "https://api.openai.com/v1/responses";
const DEFAULT_AI_MODEL_PRIMARY =
  process.env.RANGING_VALIDATION_MODEL_PRIMARY ?? "gpt-5-nano-2025-08-07";
const DEFAULT_AI_MODEL_FALLBACK =
  process.env.RANGING_VALIDATION_MODEL_FALLBACK ?? "gpt-5-mini-2025-08-07";
const DEFAULT_AI_CONFIDENCE_THRESHOLD = Number(
  process.env.RANGING_VALIDATION_CONFIDENCE_THRESHOLD ?? 0.72,
);
const DEFAULT_AI_MAX_OUTPUT_TOKENS = Number(
  process.env.RANGING_VALIDATION_MAX_OUTPUT_TOKENS ?? 800,
);
const DEFAULT_AI_TIMEOUT_MS = Number(
  process.env.RANGING_VALIDATION_TIMEOUT_MS ?? 45_000,
);
const MIN_REQUIRED_AI_CANDLES = 60;

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

const TIMEFRAME_SET = new Set<OrchestratorTimeframe>([
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

export interface CreateBacktestInput {
  botId: string;
  botName: string;
  strategyId: string;
  strategyVersion: string;
  exchangeId: string;
  accountId: string;
  symbol: string;
  fromMs: number;
  toMs: number;
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
  initialEquity: number;
  strategyConfig?: DeepPartial<RangeReversalConfig>;
  ai?: BacktestAiConfig;
}

export interface BacktestIdentity {
  backtestId: string;
  createdAtMs: number;
}

interface BacktestComputationCandles {
  executionCandles: BacktestCandle[];
  primaryRangeCandles: Candle[];
  secondaryRangeCandles: Candle[];
  klineRefs: KlineCacheReference[];
}

interface CandleResolution {
  candles: Candle[];
  ref?: KlineCacheReference;
}

interface ResolveCandlesInput {
  backtestId: string;
  symbol: string;
  timeframe: OrchestratorTimeframe;
  fromMs: number;
  toMs: number;
  refs?: KlineCacheReference[];
}

interface AiPromptDetail {
  symbol: string;
  timeframe: OrchestratorTimeframe;
  fromMs: number;
  toMs: number;
}

interface AiRangeValidationResponse {
  result: RangeValidationResult;
  finalModel: string;
  usedFallback: boolean;
}

type BacktestAiProgressReporter =
  (summary: BacktestAiSummary) => Promise<void> | void;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isTimeframe(value: unknown): value is OrchestratorTimeframe {
  return typeof value === "string" && TIMEFRAME_SET.has(value as OrchestratorTimeframe);
}

function newBacktestId(symbol: string, createdAtMs: number): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

  return `${symbol}-${createdAtMs}-${suffix}`;
}

function sanitizeRange(val: number, poc: number, vah: number): {
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

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function sanitizeReasons(reasons: string[]): string[] {
  return reasons
    .slice(0, 6)
    .map((reason) => truncateText(reason, 96));
}

function defaultRange(candles: Candle[]): {
  val: number;
  poc: number;
  vah: number;
} {
  const levels = computeVolumeProfileLevels(candles);
  return {
    val: levels.val,
    poc: levels.poc,
    vah: levels.vah,
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
    candles.reduce((acc, candle) => acc + candle.volume, 0)
    / Math.max(candles.length, 1);

  const fallbackClose = last?.close ?? first?.close ?? 1;
  const width =
    Number.isFinite(maxHigh) && Number.isFinite(minLow)
      ? maxHigh - minLow
      : 0;
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
  detail: AiPromptDetail,
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

function extractOutputText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const root = payload as Record<string, unknown>;

  if (typeof root.output_text === "string" && root.output_text.trim().length > 0) {
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
        text
        && typeof text === "object"
        && typeof (text as { value?: unknown }).value === "string"
        && (text as { value: string }).value.trim().length > 0
      ) {
        parts.push((text as { value: string }).value);
      }
      if (typeof row.output_text === "string" && row.output_text.trim().length > 0) {
        parts.push(row.output_text);
      }
      if (
        row.type === "output_json"
        && row.json
        && typeof row.json === "object"
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
  const root = raw && typeof raw === "object"
    ? (raw as Record<string, unknown>)
    : {};
  const rawRange = root.range && typeof root.range === "object"
    ? (root.range as Record<string, unknown>)
    : {};
  const reasons = Array.isArray(root.reasons)
    ? root.reasons.filter((value): value is string => typeof value === "string")
    : [];

  const isRanging = typeof root.isRanging === "boolean" ? root.isRanging : false;
  const confidenceRaw = Number(root.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? clamp(confidenceRaw, 0, 1) : 0;
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

function requireOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("Missing OPENAI_API_KEY in backtest worker environment");
  }
  return apiKey.trim();
}

async function callOpenAiModel(
  apiKey: string,
  model: string,
  detail: AiPromptDetail,
  candles: Candle[],
  maxOutputTokensOverride?: number,
): Promise<RangeValidationResult> {
  const payload = buildPromptPayload(detail, candles);
  const controller = new AbortController();
  const timeoutMs =
    Number.isFinite(DEFAULT_AI_TIMEOUT_MS) && DEFAULT_AI_TIMEOUT_MS > 0
      ? Math.floor(DEFAULT_AI_TIMEOUT_MS)
      : 45_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
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
          Number.isFinite(maxOutputTokensOverride)
          && maxOutputTokensOverride
          && maxOutputTokensOverride > 0
            ? Math.floor(maxOutputTokensOverride)
            : Number.isFinite(DEFAULT_AI_MAX_OUTPUT_TOKENS)
              && DEFAULT_AI_MAX_OUTPUT_TOKENS > 0
              ? Math.floor(DEFAULT_AI_MAX_OUTPUT_TOKENS)
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

    const responseJson = await response.json() as unknown;
    const outputText = extractOutputText(responseJson);
    if (!outputText) {
      const reason = detectMissingOutputReason(responseJson);
      throw new Error(`OpenAI response did not include assistant text (${reason})`);
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

async function runAiValidationWithFallback(
  apiKey: string,
  detail: AiPromptDetail,
  candles: Candle[],
  aiConfig: BacktestAiConfig,
): Promise<AiRangeValidationResponse> {
  const primaryBudget =
    Number.isFinite(DEFAULT_AI_MAX_OUTPUT_TOKENS) && DEFAULT_AI_MAX_OUTPUT_TOKENS > 0
      ? Math.floor(DEFAULT_AI_MAX_OUTPUT_TOKENS)
      : 800;
  const retryBudget = Math.min(primaryBudget * 2, 2_000);

  let primary: RangeValidationResult | undefined;
  let primaryError: unknown;
  try {
    primary = await callOpenAiModel(
      apiKey,
      aiConfig.modelPrimary,
      detail,
      candles,
      primaryBudget,
    );
  } catch (error) {
    primaryError = error;
    try {
      primary = await callOpenAiModel(
        apiKey,
        aiConfig.modelPrimary,
        detail,
        candles,
        retryBudget,
      );
      primaryError = undefined;
    } catch (retryError) {
      primaryError = retryError;
    }
  }

  if (primary && primary.confidence >= aiConfig.confidenceThreshold) {
    return {
      result: primary,
      finalModel: aiConfig.modelPrimary,
      usedFallback: false,
    };
  }

  let fallback: RangeValidationResult | undefined;
  let fallbackError: unknown;
  try {
    fallback = await callOpenAiModel(
      apiKey,
      aiConfig.modelFallback,
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
      finalModel: aiConfig.modelFallback,
      usedFallback: true,
    };
  }

  if (primary) {
    return {
      result: primary,
      finalModel: aiConfig.modelPrimary,
      usedFallback: false,
    };
  }

  const primaryMessage =
    primaryError instanceof Error ? primaryError.message : String(primaryError);
  const fallbackMessage =
    fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
  throw new Error(
    `Validation failed on both models. Primary: ${primaryMessage}. Fallback: ${fallbackMessage}`,
  );
}

function normalizeAiConfig(ai: BacktestAiConfig | undefined): BacktestAiConfig | undefined {
  if (!ai?.enabled) return undefined;

  const lookbackCandles = Number.isFinite(ai.lookbackCandles)
    ? Math.max(MIN_REQUIRED_AI_CANDLES, Math.floor(ai.lookbackCandles))
    : 240;
  const cadenceBars = Number.isFinite(ai.cadenceBars)
    ? Math.max(1, Math.floor(ai.cadenceBars))
    : 1;
  const maxEvaluations = Number.isFinite(ai.maxEvaluations)
    ? Math.max(1, Math.min(Math.floor(ai.maxEvaluations), 400))
    : 50;
  const confidenceThreshold = Number.isFinite(ai.confidenceThreshold)
    ? clamp(ai.confidenceThreshold, 0, 1)
    : clamp(DEFAULT_AI_CONFIDENCE_THRESHOLD, 0, 1);

  return {
    enabled: true,
    lookbackCandles,
    cadenceBars,
    maxEvaluations,
    confidenceThreshold,
    modelPrimary:
      typeof ai.modelPrimary === "string" && ai.modelPrimary.trim().length > 0
        ? ai.modelPrimary.trim()
        : DEFAULT_AI_MODEL_PRIMARY,
    modelFallback:
      typeof ai.modelFallback === "string" && ai.modelFallback.trim().length > 0
        ? ai.modelFallback.trim()
        : DEFAULT_AI_MODEL_FALLBACK,
  };
}

function createInitialAiSummary(ai: BacktestAiConfig | undefined): BacktestAiSummary | undefined {
  const normalized = normalizeAiConfig(ai);
  if (!normalized) return undefined;

  return {
    ...normalized,
    effectiveCadenceBars: normalized.cadenceBars,
    plannedEvaluations: 0,
    evaluationsRun: 0,
    evaluationsAccepted: 0,
    fallbackUsed: 0,
    failed: 0,
    evaluations: [],
  };
}

function cloneAiSummary(summary: BacktestAiSummary): BacktestAiSummary {
  return {
    ...summary,
    evaluations: [...(summary.evaluations ?? [])],
  };
}

async function reportAiProgress(
  reporter: BacktestAiProgressReporter | undefined,
  summary: BacktestAiSummary,
): Promise<void> {
  if (!reporter) return;
  try {
    await reporter(cloneAiSummary(summary));
  } catch (error) {
    console.error("[backtests][ai] progress reporter failed", { error });
  }
}

function buildEvaluationPlan(
  totalBars: number,
  aiConfig: BacktestAiConfig,
): { indices: number[]; effectiveCadenceBars: number } {
  if (totalBars <= 0) {
    return {
      indices: [],
      effectiveCadenceBars: aiConfig.cadenceBars,
    };
  }

  const startIndex = Math.max(0, MIN_REQUIRED_AI_CANDLES - 1);
  if (totalBars - 1 < startIndex) {
    return {
      indices: [],
      effectiveCadenceBars: aiConfig.cadenceBars,
    };
  }

  const span = totalBars - startIndex;
  const cadenceFromLimit = Math.max(
    aiConfig.cadenceBars,
    Math.ceil(span / aiConfig.maxEvaluations),
  );
  const effectiveCadenceBars = Math.max(1, cadenceFromLimit);

  const indices: number[] = [];
  for (let index = startIndex; index < totalBars; index += effectiveCadenceBars) {
    indices.push(index);
  }

  const lastIndex = totalBars - 1;
  if (indices.length === 0 || indices[indices.length - 1] !== lastIndex) {
    indices.push(lastIndex);
  }

  return {
    indices,
    effectiveCadenceBars,
  };
}

async function buildAiSummary(
  input: CreateBacktestInput,
  executionCandles: BacktestCandle[],
  reporter?: BacktestAiProgressReporter,
): Promise<BacktestAiSummary | undefined> {
  const aiConfig = normalizeAiConfig(input.ai);
  if (!aiConfig) return undefined;

  const apiKey = requireOpenAiApiKey();
  const summary = createInitialAiSummary(aiConfig);
  if (!summary) return undefined;

  const plan = buildEvaluationPlan(executionCandles.length, aiConfig);
  summary.effectiveCadenceBars = plan.effectiveCadenceBars;
  summary.plannedEvaluations = plan.indices.length;
  console.log("[backtests][ai] starting ai-integrated range validation", {
    symbol: input.symbol,
    timeframe: input.executionTimeframe,
    candles: executionCandles.length,
    lookbackCandles: aiConfig.lookbackCandles,
    cadenceBars: aiConfig.cadenceBars,
    effectiveCadenceBars: summary.effectiveCadenceBars,
    plannedEvaluations: plan.indices.length,
    maxEvaluations: aiConfig.maxEvaluations,
  });
  await reportAiProgress(reporter, summary);

  for (const index of plan.indices) {
    const windowFrom = Math.max(0, index - aiConfig.lookbackCandles + 1);
    const window = executionCandles.slice(windowFrom, index + 1);
    if (window.length < MIN_REQUIRED_AI_CANDLES) {
      continue;
    }

    const fromMs = window[0]?.time ?? input.fromMs;
    const toMs = window[window.length - 1]?.time ?? input.toMs;
    const detail: AiPromptDetail = {
      symbol: input.symbol,
      timeframe: input.executionTimeframe,
      fromMs,
      toMs,
    };

    try {
      const validation = await runAiValidationWithFallback(
        apiKey,
        detail,
        window,
        aiConfig,
      );
      const accepted =
        validation.result.isRanging
        && validation.result.confidence >= aiConfig.confidenceThreshold;

      summary.evaluationsRun += 1;
      if (accepted) summary.evaluationsAccepted += 1;
      if (validation.usedFallback) summary.fallbackUsed += 1;

      summary.evaluations?.push({
        atIndex: index,
        atTime: executionCandles[index]?.time ?? toMs,
        finalModel: validation.finalModel,
        usedFallback: validation.usedFallback,
        isRanging: validation.result.isRanging,
        confidence: validation.result.confidence,
        accepted,
        range: {
          val: validation.result.range.val,
          poc: validation.result.range.poc,
          vah: validation.result.range.vah,
        },
        reasons: sanitizeReasons(validation.result.reasons),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallback = defaultRange(window);

      summary.evaluationsRun += 1;
      summary.failed += 1;
      summary.evaluations?.push({
        atIndex: index,
        atTime: executionCandles[index]?.time ?? toMs,
        finalModel: aiConfig.modelPrimary,
        usedFallback: false,
        isRanging: false,
        confidence: 0,
        accepted: false,
        range: fallback,
        reasons: ["ai_validation_failed"],
        errorMessage: truncateText(message, 240),
      });
    }

    if (summary.evaluationsRun % 10 === 0) {
      console.log("[backtests][ai] progress", {
        symbol: input.symbol,
        evaluationsRun: summary.evaluationsRun,
        planned: plan.indices.length,
        accepted: summary.evaluationsAccepted,
        failed: summary.failed,
      });
    }
    await reportAiProgress(reporter, summary);
  }

  console.log("[backtests][ai] completed ai-integrated range validation", {
    symbol: input.symbol,
    evaluationsRun: summary.evaluationsRun,
    evaluationsAccepted: summary.evaluationsAccepted,
    fallbackUsed: summary.fallbackUsed,
    failed: summary.failed,
  });
  await reportAiProgress(reporter, summary);

  return summary;
}

function applyAiSummaryToExecutionCandles(
  executionCandles: BacktestCandle[],
  ai: BacktestAiSummary | undefined,
): BacktestCandle[] {
  if (!ai?.enabled || !ai.evaluations || ai.evaluations.length === 0) {
    return executionCandles;
  }

  const ordered = [...ai.evaluations]
    .filter((entry) => Number.isFinite(entry.atIndex) && entry.atIndex >= 0)
    .sort((left, right) => left.atIndex - right.atIndex);

  if (ordered.length === 0) return executionCandles;

  let cursor = 0;
  let active: BacktestAiEvaluation | undefined;

  return executionCandles.map((candle, index) => {
    while (cursor < ordered.length) {
      const current = ordered[cursor];
      if (!current || current.atIndex > index) break;
      active = current;
      cursor += 1;
    }

    if (!active) return candle;

    return {
      ...candle,
      features: {
        ...(candle.features ?? {}),
        rangeValid: active.accepted,
        val: active.range.val,
        poc: active.range.poc,
        vah: active.range.vah,
      },
    };
  });
}

function dedupeRefs(refs: Array<KlineCacheReference | undefined>): KlineCacheReference[] {
  const byKey = new Map<string, KlineCacheReference>();

  for (const ref of refs) {
    if (!ref) continue;
    const normalized = normalizeKlineReference(ref);
    const identity = normalized.key;
    if (!identity) continue;
    byKey.set(identity, normalized);
  }

  return [...byKey.values()];
}

async function resolveCandles(input: ResolveCandlesInput): Promise<CandleResolution> {
  const existing = findMatchingKlineRef(
    input.refs,
    input.symbol,
    input.timeframe,
    input.fromMs,
    input.toMs,
  );

  if (existing) {
    const cached = await loadCandlesFromCacheRef(existing);
    if (cached && cached.length > 0) {
      return {
        candles: cached,
        ref: normalizeKlineReference(existing),
      };
    }
  }

  const windowKey = buildWindowKlineCacheKey(
    input.symbol,
    input.timeframe,
    input.fromMs,
    input.toMs,
  );
  const sharedWindowCandles = await loadCandlesFromCacheKey(windowKey);
  if (sharedWindowCandles && sharedWindowCandles.length > 0) {
    return {
      candles: sharedWindowCandles,
      ref: normalizeKlineReference({
        key: windowKey,
        symbol: input.symbol,
        timeframe: input.timeframe,
        fromMs: input.fromMs,
        toMs: input.toMs,
        candleCount: sharedWindowCandles.length,
      }),
    };
  }

  const candles = await fetchHistoricalKlines({
    symbol: input.symbol,
    timeframe: input.timeframe,
    fromMs: input.fromMs,
    toMs: input.toMs,
  });

  try {
    const savedRef = await saveBacktestKlineCache({
      backtestId: input.backtestId,
      symbol: input.symbol,
      timeframe: input.timeframe,
      fromMs: input.fromMs,
      toMs: input.toMs,
      candles,
    });

    return {
      candles,
      ref: savedRef,
    };
  } catch (error) {
    console.error("[backtests] failed to persist kline cache", {
      backtestId: input.backtestId,
      symbol: input.symbol,
      timeframe: input.timeframe,
      fromMs: input.fromMs,
      toMs: input.toMs,
      error,
    });

    return { candles };
  }
}

async function fetchBacktestCandles(
  input: CreateBacktestInput,
  backtestId: string,
  refs?: KlineCacheReference[],
): Promise<BacktestComputationCandles> {
  const byTimeframe = new Map<OrchestratorTimeframe, Promise<CandleResolution>>();

  const getCandlesForTimeframe = (timeframe: OrchestratorTimeframe) => {
    const existing = byTimeframe.get(timeframe);
    if (existing) return existing;

    const created = resolveCandles({
      backtestId,
      symbol: input.symbol,
      timeframe,
      fromMs: input.fromMs,
      toMs: input.toMs,
      refs,
    });
    byTimeframe.set(timeframe, created);
    return created;
  };

  const [execution, primary, secondary] = await Promise.all([
    getCandlesForTimeframe(input.executionTimeframe),
    getCandlesForTimeframe(input.primaryRangeTimeframe),
    getCandlesForTimeframe(input.secondaryRangeTimeframe),
  ]);

  return {
    executionCandles: execution.candles as BacktestCandle[],
    primaryRangeCandles: primary.candles,
    secondaryRangeCandles: secondary.candles,
    klineRefs: dedupeRefs([
      ...(refs ?? []),
      execution.ref,
      primary.ref,
      secondary.ref,
    ]),
  };
}

function runComputation(
  input: CreateBacktestInput,
  candles: BacktestComputationCandles,
): BacktestResult {
  if (candles.executionCandles.length < 80) {
    throw new Error(
      `Not enough execution candles (${candles.executionCandles.length}) for ${input.symbol}`,
    );
  }

  const bot = createRangingBot(input.strategyConfig);
  return bot.runBacktest({
    initialEquity: input.initialEquity,
    executionCandles: candles.executionCandles,
    primaryRangeCandles: candles.primaryRangeCandles,
    secondaryRangeCandles: candles.secondaryRangeCandles,
  });
}

function toInputFromRecord(record: BacktestRecord): CreateBacktestInput {
  return {
    botId: record.botId,
    botName: record.botName,
    strategyId: record.strategyId,
    strategyVersion: record.strategyVersion,
    exchangeId: record.exchangeId,
    accountId: record.accountId,
    symbol: record.symbol,
    fromMs: record.fromMs,
    toMs: record.toMs,
    executionTimeframe: record.executionTimeframe,
    primaryRangeTimeframe: record.primaryRangeTimeframe,
    secondaryRangeTimeframe: record.secondaryRangeTimeframe,
    initialEquity: record.initialEquity,
    ai: record.ai
      ? {
          enabled: record.ai.enabled,
          lookbackCandles: record.ai.lookbackCandles,
          cadenceBars: record.ai.cadenceBars,
          maxEvaluations: record.ai.maxEvaluations,
          confidenceThreshold: record.ai.confidenceThreshold,
          modelPrimary: record.ai.modelPrimary,
          modelFallback: record.ai.modelFallback,
        }
      : undefined,
  };
}

function enrichTradesWithRangeLevels(
  input: CreateBacktestInput,
  candles: BacktestComputationCandles,
  trades: BacktestTrade[],
): BacktestTradeView[] {
  const bot = createRangingBot(input.strategyConfig);
  const indexByTime = new Map<number, number>();

  candles.executionCandles.forEach((candle, index) => {
    indexByTime.set(candle.time, index);
  });

  return trades.map((trade) => {
    const entryIndex = indexByTime.get(trade.entryTime);
    if (entryIndex === undefined) {
      return {
        ...trade,
        exits: [...trade.exits],
      };
    }

    try {
      const snapshot = bot.buildSignalSnapshot({
        executionCandles: candles.executionCandles,
        index: entryIndex,
        primaryRangeCandles: candles.primaryRangeCandles,
        secondaryRangeCandles: candles.secondaryRangeCandles,
      });

      return {
        ...trade,
        exits: [...trade.exits],
        rangeLevels: {
          val: snapshot.range.effective.val,
          vah: snapshot.range.effective.vah,
          poc: snapshot.range.effective.poc,
        },
      };
    } catch {
      return {
        ...trade,
        exits: [...trade.exits],
      };
    }
  });
}

export function createBacktestIdentity(
  symbol: string,
  createdAtMs = Date.now(),
): BacktestIdentity {
  return {
    createdAtMs,
    backtestId: newBacktestId(symbol, createdAtMs),
  };
}

export function createRunningBacktestRecord(
  input: CreateBacktestInput,
  identity: BacktestIdentity,
): BacktestRecord {
  return {
    id: identity.backtestId,
    createdAtMs: identity.createdAtMs,
    status: "running",
    botId: input.botId,
    botName: input.botName,
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    exchangeId: input.exchangeId,
    accountId: input.accountId,
    symbol: input.symbol,
    fromMs: input.fromMs,
    toMs: input.toMs,
    executionTimeframe: input.executionTimeframe,
    primaryRangeTimeframe: input.primaryRangeTimeframe,
    secondaryRangeTimeframe: input.secondaryRangeTimeframe,
    initialEquity: input.initialEquity,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    netPnl: 0,
    grossProfit: 0,
    grossLoss: 0,
    maxDrawdownPct: 0,
    endingEquity: input.initialEquity,
    ai: createInitialAiSummary(input.ai),
  };
}

export function createFailedBacktestRecord(
  input: CreateBacktestInput,
  identity: BacktestIdentity,
  errorMessage: string,
): BacktestRecord {
  return {
    ...createRunningBacktestRecord(input, identity),
    status: "failed",
    errorMessage,
  };
}

export async function runBacktestJob(
  input: CreateBacktestInput,
  identityInput?: BacktestIdentity,
  options?: {
    onAiProgress?: BacktestAiProgressReporter;
  },
): Promise<BacktestRecord> {
  const identity = identityInput ?? createBacktestIdentity(input.symbol);

  try {
    console.log("[backtests] job started", {
      backtestId: identity.backtestId,
      symbol: input.symbol,
      executionTimeframe: input.executionTimeframe,
      primaryRangeTimeframe: input.primaryRangeTimeframe,
      secondaryRangeTimeframe: input.secondaryRangeTimeframe,
      fromMs: input.fromMs,
      toMs: input.toMs,
      aiEnabled: input.ai?.enabled ?? false,
    });

    const candles = await fetchBacktestCandles(input, identity.backtestId);
    console.log("[backtests] candles loaded", {
      backtestId: identity.backtestId,
      symbol: input.symbol,
      executionCandles: candles.executionCandles.length,
      primaryCandles: candles.primaryRangeCandles.length,
      secondaryCandles: candles.secondaryRangeCandles.length,
    });
    const aiSummary = await buildAiSummary(
      input,
      candles.executionCandles,
      options?.onAiProgress,
    );
    const executionCandles = applyAiSummaryToExecutionCandles(
      candles.executionCandles,
      aiSummary,
    );

    const candlesForComputation: BacktestComputationCandles = {
      ...candles,
      executionCandles,
    };

    const result = runComputation(input, candlesForComputation);
    console.log("[backtests] job completed", {
      backtestId: identity.backtestId,
      symbol: input.symbol,
      totalTrades: result.metrics.totalTrades,
      netPnl: result.metrics.netPnl,
      endingEquity: result.metrics.endingEquity,
      aiEvaluations: aiSummary?.evaluationsRun ?? 0,
      aiAccepted: aiSummary?.evaluationsAccepted ?? 0,
    });

    return {
      id: identity.backtestId,
      createdAtMs: identity.createdAtMs,
      status: "completed",
      botId: input.botId,
      botName: input.botName,
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      exchangeId: input.exchangeId,
      accountId: input.accountId,
      symbol: input.symbol,
      fromMs: input.fromMs,
      toMs: input.toMs,
      executionTimeframe: input.executionTimeframe,
      primaryRangeTimeframe: input.primaryRangeTimeframe,
      secondaryRangeTimeframe: input.secondaryRangeTimeframe,
      initialEquity: input.initialEquity,
      totalTrades: result.metrics.totalTrades,
      wins: result.metrics.wins,
      losses: result.metrics.losses,
      winRate: result.metrics.winRate,
      netPnl: result.metrics.netPnl,
      grossProfit: result.metrics.grossProfit,
      grossLoss: result.metrics.grossLoss,
      maxDrawdownPct: result.metrics.maxDrawdownPct,
      endingEquity: result.metrics.endingEquity,
      klineRefs: candles.klineRefs,
      ai: aiSummary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[backtests] job failed", {
      backtestId: identity.backtestId,
      symbol: input.symbol,
      message,
    });
    return createFailedBacktestRecord(input, identity, message);
  }
}

export interface ReplayedBacktest {
  result: BacktestResult;
  chartCandles: Candle[];
  chartCandlesRef?: KlineCacheReference;
  trades: BacktestTradeView[];
  klineRefs: KlineCacheReference[];
}

export async function replayBacktestRecord(
  record: BacktestRecord,
  chartTimeframe: OrchestratorTimeframe,
): Promise<ReplayedBacktest> {
  const input = toInputFromRecord(record);
  const candles = await fetchBacktestCandles(
    input,
    record.id,
    record.klineRefs,
  );
  const chart = await resolveCandles({
    backtestId: record.id,
    symbol: record.symbol,
    timeframe: chartTimeframe,
    fromMs: record.fromMs,
    toMs: record.toMs,
    refs: candles.klineRefs,
  });

  const executionCandles = applyAiSummaryToExecutionCandles(
    candles.executionCandles,
    record.ai,
  );

  const candlesForComputation: BacktestComputationCandles = {
    ...candles,
    executionCandles,
  };

  const result = runComputation(input, candlesForComputation);

  return {
    result,
    chartCandles: chart.candles,
    chartCandlesRef: chart.ref,
    trades: enrichTradesWithRangeLevels(input, candlesForComputation, result.trades),
    klineRefs: dedupeRefs([...candles.klineRefs, chart.ref]),
  };
}
