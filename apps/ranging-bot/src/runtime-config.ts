import type { DeepPartial, RangeReversalConfig } from "@repo/ranging-core";
import type { OrchestratorTimeframe } from "./contracts";

const timeframeMs: Record<OrchestratorTimeframe, number> = {
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

export interface RuntimeBotConfig {
  enabled?: boolean;
  symbol: string;
  executionTimeframe: OrchestratorTimeframe;
  primaryRangeTimeframe: OrchestratorTimeframe;
  secondaryRangeTimeframe: OrchestratorTimeframe;
  executionLimit: number;
  primaryRangeLimit: number;
  secondaryRangeLimit: number;
  strategyConfig?: DeepPartial<RangeReversalConfig>;
  dryRun?: boolean;
  marginMode?: "CROSS" | "ISOLATED";
  valueQty?: string;
}

const defaultBotConfig: Omit<RuntimeBotConfig, "symbol"> = {
  executionTimeframe: "15m",
  primaryRangeTimeframe: "1d",
  secondaryRangeTimeframe: "4h",
  executionLimit: 240,
  primaryRangeLimit: 90,
  secondaryRangeLimit: 180,
};

export function toBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.trim().toLowerCase() === "true";
}

function isTimeframe(value: unknown): value is OrchestratorTimeframe {
  return typeof value === "string" && value in timeframeMs;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
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
  const primaryRangeTimeframe = isTimeframe(item.primaryRangeTimeframe)
    ? item.primaryRangeTimeframe
    : defaultBotConfig.primaryRangeTimeframe;
  const secondaryRangeTimeframe = isTimeframe(item.secondaryRangeTimeframe)
    ? item.secondaryRangeTimeframe
    : defaultBotConfig.secondaryRangeTimeframe;

  return {
    enabled: item.enabled,
    symbol: item.symbol,
    executionTimeframe,
    primaryRangeTimeframe,
    secondaryRangeTimeframe,
    executionLimit: toPositiveInt(item.executionLimit, defaultBotConfig.executionLimit),
    primaryRangeLimit: toPositiveInt(item.primaryRangeLimit, defaultBotConfig.primaryRangeLimit),
    secondaryRangeLimit: toPositiveInt(item.secondaryRangeLimit, defaultBotConfig.secondaryRangeLimit),
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

export function getClosedCandleEndTime(nowMs: number, timeframe: OrchestratorTimeframe): number {
  const frameMs = timeframeMs[timeframe];
  return Math.floor(nowMs / frameMs) * frameMs - 1;
}

