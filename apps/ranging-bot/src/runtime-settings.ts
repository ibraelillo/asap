import { Resource } from "sst";

interface RuntimeConfigResource {
  openAiResponsesEndpoint?: string;
  kucoinPublicBaseUrl?: string;
  validationModelPrimary?: string;
  validationModelFallback?: string;
  validationConfidenceThreshold?: string | number;
  validationMaxOutputTokens?: string | number;
  validationTimeoutMs?: string | number;
  klineHttpTimeoutMs?: string | number;
  klineHttpRetries?: string | number;
  klineHttpBackoffMs?: string | number;
  backtestRunningStaleMs?: string | number;
  defaultDryRun?: string | boolean;
  defaultMarginMode?: string;
  defaultValueQty?: string | number;
  klinesPublicBaseUrl?: string;
  symbolsPublicBaseUrl?: string;
  sharedFeedExecutionEnabled?: string | boolean;
}

export interface RuntimeSettings {
  openAiResponsesEndpoint: string;
  kucoinPublicBaseUrl: string;
  validationModelPrimary: string;
  validationModelFallback: string;
  validationConfidenceThreshold: number;
  validationMaxOutputTokens: number;
  validationTimeoutMs: number;
  klineHttpTimeoutMs: number;
  klineHttpRetries: number;
  klineHttpBackoffMs: number;
  backtestRunningStaleMs: number;
  defaultDryRun: boolean;
  defaultMarginMode: "CROSS" | "ISOLATED";
  defaultValueQty: string;
  klinesPublicBaseUrl?: string;
  symbolsPublicBaseUrl?: string;
  sharedFeedExecutionEnabled: boolean;
}

const DEFAULTS = {
  openAiResponsesEndpoint: "https://api.openai.com/v1/responses",
  kucoinPublicBaseUrl: "https://api-futures.kucoin.com",
  validationModelPrimary: "gpt-5-nano-2025-08-07",
  validationModelFallback: "gpt-5-mini-2025-08-07",
  validationConfidenceThreshold: 0.72,
  validationMaxOutputTokens: 800,
  validationTimeoutMs: 45_000,
  klineHttpTimeoutMs: 20_000,
  klineHttpRetries: 3,
  klineHttpBackoffMs: 350,
  backtestRunningStaleMs: 20 * 60_000,
  defaultDryRun: true,
  defaultMarginMode: "CROSS" as const,
  defaultValueQty: "100",
  sharedFeedExecutionEnabled: false,
};

let cachedSettings: RuntimeSettings | null = null;

function getLinkedRuntimeConfig(): RuntimeConfigResource {
  try {
    const resources = Resource as unknown as Record<
      string,
      RuntimeConfigResource | undefined
    >;
    return resources.RuntimeConfig ?? {};
  } catch {
    return {};
  }
}

function readString(
  linkedValue: unknown,
  envValue: string | undefined,
  fallback: string,
): string {
  if (typeof linkedValue === "string" && linkedValue.trim().length > 0) {
    return linkedValue.trim();
  }
  if (typeof envValue === "string" && envValue.trim().length > 0) {
    return envValue.trim();
  }
  return fallback;
}

function readOptionalString(
  linkedValue: unknown,
  envValue: string | undefined,
): string | undefined {
  if (typeof linkedValue === "string" && linkedValue.trim().length > 0) {
    return linkedValue.trim();
  }
  if (typeof envValue === "string" && envValue.trim().length > 0) {
    return envValue.trim();
  }
  return undefined;
}

function readNumber(
  linkedValue: unknown,
  envValue: string | undefined,
  fallback: number,
): number {
  const candidates = [linkedValue, envValue];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

function readBoolean(
  linkedValue: unknown,
  envValue: string | undefined,
  fallback: boolean,
): boolean {
  if (typeof linkedValue === "boolean") {
    return linkedValue;
  }
  if (typeof linkedValue === "string") {
    return linkedValue.trim().toLowerCase() === "true";
  }
  if (typeof envValue === "string") {
    return envValue.trim().toLowerCase() === "true";
  }
  return fallback;
}

function readMarginMode(
  linkedValue: unknown,
  envValue: string | undefined,
): "CROSS" | "ISOLATED" {
  if (linkedValue === "ISOLATED" || envValue === "ISOLATED") {
    return "ISOLATED";
  }
  return "CROSS";
}

export function getRuntimeSettings(): RuntimeSettings {
  if (cachedSettings) {
    return cachedSettings;
  }

  const linked = getLinkedRuntimeConfig();
  cachedSettings = {
    openAiResponsesEndpoint: readString(
      linked.openAiResponsesEndpoint,
      process.env.OPENAI_RESPONSES_ENDPOINT,
      DEFAULTS.openAiResponsesEndpoint,
    ),
    kucoinPublicBaseUrl: readString(
      linked.kucoinPublicBaseUrl,
      process.env.KUCOIN_PUBLIC_BASE_URL,
      DEFAULTS.kucoinPublicBaseUrl,
    ),
    validationModelPrimary: readString(
      linked.validationModelPrimary,
      process.env.RANGING_VALIDATION_MODEL_PRIMARY,
      DEFAULTS.validationModelPrimary,
    ),
    validationModelFallback: readString(
      linked.validationModelFallback,
      process.env.RANGING_VALIDATION_MODEL_FALLBACK,
      DEFAULTS.validationModelFallback,
    ),
    validationConfidenceThreshold: readNumber(
      linked.validationConfidenceThreshold,
      process.env.RANGING_VALIDATION_CONFIDENCE_THRESHOLD,
      DEFAULTS.validationConfidenceThreshold,
    ),
    validationMaxOutputTokens: readNumber(
      linked.validationMaxOutputTokens,
      process.env.RANGING_VALIDATION_MAX_OUTPUT_TOKENS,
      DEFAULTS.validationMaxOutputTokens,
    ),
    validationTimeoutMs: readNumber(
      linked.validationTimeoutMs,
      process.env.RANGING_VALIDATION_TIMEOUT_MS,
      DEFAULTS.validationTimeoutMs,
    ),
    klineHttpTimeoutMs: readNumber(
      linked.klineHttpTimeoutMs,
      process.env.RANGING_KLINE_HTTP_TIMEOUT_MS,
      DEFAULTS.klineHttpTimeoutMs,
    ),
    klineHttpRetries: readNumber(
      linked.klineHttpRetries,
      process.env.RANGING_KLINE_HTTP_RETRIES,
      DEFAULTS.klineHttpRetries,
    ),
    klineHttpBackoffMs: readNumber(
      linked.klineHttpBackoffMs,
      process.env.RANGING_KLINE_HTTP_BACKOFF_MS,
      DEFAULTS.klineHttpBackoffMs,
    ),
    backtestRunningStaleMs: readNumber(
      linked.backtestRunningStaleMs,
      process.env.RANGING_BACKTEST_RUNNING_STALE_MS,
      DEFAULTS.backtestRunningStaleMs,
    ),
    defaultDryRun: readBoolean(
      linked.defaultDryRun,
      process.env.RANGING_DRY_RUN,
      DEFAULTS.defaultDryRun,
    ),
    defaultMarginMode: readMarginMode(
      linked.defaultMarginMode,
      process.env.RANGING_MARGIN_MODE,
    ),
    defaultValueQty: readString(
      linked.defaultValueQty,
      process.env.RANGING_VALUE_QTY,
      DEFAULTS.defaultValueQty,
    ),
    klinesPublicBaseUrl: readOptionalString(
      linked.klinesPublicBaseUrl,
      process.env.RANGING_KLINES_PUBLIC_BASE_URL,
    ),
    symbolsPublicBaseUrl: readOptionalString(
      linked.symbolsPublicBaseUrl,
      process.env.RANGING_SYMBOLS_PUBLIC_BASE_URL,
    ),
    sharedFeedExecutionEnabled: readBoolean(
      linked.sharedFeedExecutionEnabled,
      process.env.RANGING_SHARED_FEED_EXECUTION_ENABLED,
      DEFAULTS.sharedFeedExecutionEnabled,
    ),
  };

  return cachedSettings;
}
