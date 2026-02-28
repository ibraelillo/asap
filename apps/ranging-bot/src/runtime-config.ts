import type { BotDefinition, Timeframe } from "@repo/trading-engine";

const timeframeMs: Record<Timeframe, number> = {
  "1m": 60_000,
  "3m": 3 * 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "8h": 8 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
};
const MIN_RANGE_TIMEFRAME_MS = 2 * 60 * 60_000;

export type OrchestratorTimeframe = Timeframe;

export interface RuntimeBotConfig {
  id?: string;
  name?: string;
  strategyId?: string;
  strategyVersion?: string;
  exchangeId?: string;
  accountId?: string;
  enabled?: boolean;
  symbol: string;
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
  executionLimit: number;
  primaryRangeLimit: number;
  secondaryRangeLimit: number;
  strategyConfig?: Record<string, unknown>;
  dryRun?: boolean;
  marginMode?: "CROSS" | "ISOLATED";
  valueQty?: string;
}

const defaultBotConfig = {
  executionTimeframe: "1h",
  primaryRangeTimeframe: "1d",
  secondaryRangeTimeframe: "4h",
  executionLimit: 240,
  primaryRangeLimit: 90,
  secondaryRangeLimit: 180,
  strategyId: "range-reversal",
  strategyVersion: "1",
  exchangeId: "kucoin",
  accountId: "default",
} as const satisfies {
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
  executionLimit: number;
  primaryRangeLimit: number;
  secondaryRangeLimit: number;
  strategyId: string;
  strategyVersion: string;
  exchangeId: string;
  accountId: string;
};

export function toBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue;
  return value.trim().toLowerCase() === "true";
}

function isTimeframe(value: unknown): value is OrchestratorTimeframe {
  return typeof value === "string" && value in timeframeMs;
}

function isRangeTimeframe(value: OrchestratorTimeframe): boolean {
  return timeframeMs[value] >= MIN_RANGE_TIMEFRAME_MS;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function sanitizeSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default"
  );
}

export function buildBotId(input: {
  exchangeId: string;
  accountId: string;
  strategyId: string;
  symbol: string;
}): string {
  return [input.exchangeId, input.accountId, input.strategyId, input.symbol]
    .map(sanitizeSegment)
    .join("-");
}

export function normalizeBotConfig(raw: unknown): RuntimeBotConfig | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Partial<RuntimeBotConfig>;

  if (!item.symbol || typeof item.symbol !== "string") {
    return null;
  }

  const executionTimeframe = isTimeframe(item.executionTimeframe)
    ? item.executionTimeframe
    : defaultBotConfig.executionTimeframe;
  const primaryRangeTimeframe =
    isTimeframe(item.primaryRangeTimeframe) &&
    isRangeTimeframe(item.primaryRangeTimeframe)
      ? item.primaryRangeTimeframe
      : defaultBotConfig.primaryRangeTimeframe;
  const secondaryRangeTimeframe =
    isTimeframe(item.secondaryRangeTimeframe) &&
    isRangeTimeframe(item.secondaryRangeTimeframe)
      ? item.secondaryRangeTimeframe
      : defaultBotConfig.secondaryRangeTimeframe;

  const strategyId =
    typeof item.strategyId === "string" && item.strategyId.length > 0
      ? item.strategyId
      : defaultBotConfig.strategyId;
  const strategyVersion =
    typeof item.strategyVersion === "string" && item.strategyVersion.length > 0
      ? item.strategyVersion
      : defaultBotConfig.strategyVersion;
  const exchangeId =
    typeof item.exchangeId === "string" && item.exchangeId.length > 0
      ? item.exchangeId
      : defaultBotConfig.exchangeId;
  const accountId =
    typeof item.accountId === "string" && item.accountId.length > 0
      ? item.accountId
      : defaultBotConfig.accountId;

  return {
    id:
      typeof item.id === "string" && item.id.length > 0
        ? item.id
        : buildBotId({
            exchangeId,
            accountId,
            strategyId,
            symbol: item.symbol,
          }),
    name:
      typeof item.name === "string" && item.name.length > 0
        ? item.name
        : item.symbol,
    strategyId,
    strategyVersion,
    exchangeId,
    accountId,
    enabled: item.enabled,
    symbol: item.symbol,
    executionTimeframe,
    primaryRangeTimeframe,
    secondaryRangeTimeframe,
    executionLimit: toPositiveInt(
      item.executionLimit,
      defaultBotConfig.executionLimit,
    ),
    primaryRangeLimit: toPositiveInt(
      item.primaryRangeLimit,
      defaultBotConfig.primaryRangeLimit,
    ),
    secondaryRangeLimit: toPositiveInt(
      item.secondaryRangeLimit,
      defaultBotConfig.secondaryRangeLimit,
    ),
    strategyConfig: item.strategyConfig,
    dryRun: item.dryRun,
    marginMode: item.marginMode,
    valueQty: item.valueQty,
  };
}

export function parseBotConfigs(raw: string | undefined): RuntimeBotConfig[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeBotConfig)
      .filter((value): value is RuntimeBotConfig => Boolean(value));
  } catch {
    console.error("[ranging-tick] Invalid RANGING_BOTS_JSON");
    return [];
  }
}

export function toBotDefinition(config: RuntimeBotConfig): BotDefinition {
  const nowMs = Date.now();
  return {
    id:
      config.id ??
      buildBotId({
        exchangeId: config.exchangeId ?? defaultBotConfig.exchangeId,
        accountId: config.accountId ?? defaultBotConfig.accountId,
        strategyId: config.strategyId ?? defaultBotConfig.strategyId,
        symbol: config.symbol,
      }),
    name: config.name ?? config.symbol,
    strategyId:
      config.strategyId ?? defaultBotConfig.strategyId ?? "range-reversal",
    strategyVersion:
      config.strategyVersion ?? defaultBotConfig.strategyVersion ?? "1",
    exchangeId: config.exchangeId ?? defaultBotConfig.exchangeId ?? "kucoin",
    accountId: config.accountId ?? defaultBotConfig.accountId ?? "default",
    symbol: config.symbol,
    marketType: "futures",
    status: config.enabled === false ? "paused" : "active",
    execution: {
      trigger: "cron",
      executionTimeframe: config.executionTimeframe,
      warmupBars: Math.max(config.executionLimit, config.secondaryRangeLimit),
    },
    context: {
      primaryPriceTimeframe: config.executionTimeframe,
      additionalTimeframes: [
        config.primaryRangeTimeframe,
        config.secondaryRangeTimeframe,
      ],
      providers: [],
    },
    riskProfileId: `${config.id ?? config.symbol}:risk`,
    strategyConfig: (config.strategyConfig ?? {}) as Record<string, unknown>,
    metadata: {
      primaryRangeTimeframe: config.primaryRangeTimeframe,
      secondaryRangeTimeframe: config.secondaryRangeTimeframe,
      executionLimit: config.executionLimit,
      primaryRangeLimit: config.primaryRangeLimit,
      secondaryRangeLimit: config.secondaryRangeLimit,
      dryRun: config.dryRun,
      marginMode: config.marginMode,
      valueQty: config.valueQty,
    },
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export function parseBotDefinitions(raw: string | undefined): BotDefinition[] {
  return parseBotConfigs(raw).map(toBotDefinition);
}

export function getClosedCandleEndTime(
  nowMs: number,
  timeframe: OrchestratorTimeframe,
): number {
  const frameMs = timeframeMs[timeframe];
  return Math.floor(nowMs / frameMs) * frameMs - 1;
}

export function getTimeframeDurationMs(
  timeframe: OrchestratorTimeframe,
): number {
  return timeframeMs[timeframe];
}

export function isRangeTimeframeAtLeast2h(
  timeframe: OrchestratorTimeframe,
): boolean {
  return isRangeTimeframe(timeframe);
}
