import type { Candle } from "@repo/ranging-core";
import type { OrchestratorTimeframe } from "../contracts";
import { getRuntimeSettings } from "../runtime-settings";

type KucoinKlineRow = Array<string | number>;

interface KucoinKlineResponse {
  code: string;
  data?: KucoinKlineRow[];
  msg?: string;
}

const granularityByTimeframe: Record<OrchestratorTimeframe, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "12h": 720,
  "1d": 1440,
  "1w": 10080,
};

const REQUEST_WINDOW_ROWS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTimestamp(value: string | number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    throw new Error(`Invalid kline timestamp: ${value}`);
  }

  return raw < 1_000_000_000_000 ? raw * 1000 : raw;
}

function parseOHLC(row: KucoinKlineRow): {
  open: number;
  high: number;
  low: number;
  close: number;
} {
  if (row.length < 5) {
    throw new Error(`Invalid kline row length: ${row.length}`);
  }

  const a = Number(row[1]);
  const b = Number(row[2]);
  const c = Number(row[3]);
  const d = Number(row[4]);

  const formatA = { open: a, close: b, high: c, low: d };
  const formatB = { open: a, high: b, low: c, close: d };

  const formatAValid =
    formatA.high >= Math.max(formatA.open, formatA.close) &&
    formatA.low <= Math.min(formatA.open, formatA.close);

  const formatBValid =
    formatB.high >= Math.max(formatB.open, formatB.close) &&
    formatB.low <= Math.min(formatB.open, formatB.close);

  if (formatAValid && !formatBValid) return formatA;
  if (formatBValid && !formatAValid) return formatB;
  if (formatBValid) return formatB;

  return formatA;
}

function parseRows(rows: KucoinKlineRow[]): Candle[] {
  const parsed: Candle[] = [];

  for (const row of rows) {
    try {
      const timestamp = row[0];
      if (timestamp === undefined) {
        continue;
      }

      const time = parseTimestamp(timestamp);
      const { open, high, low, close } = parseOHLC(row);
      const volume = Number(row[5] ?? 0);

      if (
        ![open, high, low, close, volume].every((value) =>
          Number.isFinite(value),
        )
      ) {
        continue;
      }

      parsed.push({ time, open, high, low, close, volume });
    } catch {
      // ignore malformed row
    }
  }

  const byTime = new Map<number, Candle>();
  for (const candle of parsed) {
    byTime.set(candle.time, candle);
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function granularityFor(timeframe: OrchestratorTimeframe): number {
  const granularity = granularityByTimeframe[timeframe];
  if (!granularity) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  return granularity;
}

async function fetchKucoinKlineWindow(
  symbol: string,
  granularity: number,
  fromMs: number,
  toMs: number,
): Promise<Candle[]> {
  const runtimeSettings = getRuntimeSettings();
  const params = new URLSearchParams({
    symbol,
    granularity: String(granularity),
    from: String(Math.floor(fromMs)),
    to: String(Math.floor(toMs)),
  });

  const maxRetries =
    Number.isFinite(runtimeSettings.klineHttpRetries) &&
    runtimeSettings.klineHttpRetries > 0
      ? Math.floor(runtimeSettings.klineHttpRetries)
      : 3;
  const timeoutMs =
    Number.isFinite(runtimeSettings.klineHttpTimeoutMs) &&
    runtimeSettings.klineHttpTimeoutMs > 0
      ? Math.floor(runtimeSettings.klineHttpTimeoutMs)
      : 20_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${runtimeSettings.kucoinPublicBaseUrl}/api/v1/kline/query?${params.toString()}`,
        {
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error(
          `KuCoin public kline request failed (${response.status})`,
        );
      }

      const payload = (await response.json()) as KucoinKlineResponse;
      if (payload.code !== "200000") {
        throw new Error(
          `KuCoin getKlines error: ${payload.msg ?? payload.code}`,
        );
      }

      return parseRows(payload.data ?? []);
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) {
        break;
      }
      const backoffBase =
        Number.isFinite(runtimeSettings.klineHttpBackoffMs) &&
        runtimeSettings.klineHttpBackoffMs > 0
          ? Math.floor(runtimeSettings.klineHttpBackoffMs)
          : 350;
      const delay = backoffBase * attempt;
      await sleep(delay);
    } finally {
      clearTimeout(timeout);
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `KuCoin public kline request failed after ${maxRetries} attempts: ${message}`,
  );
}

export interface FetchTradeContextKlinesInput {
  symbol: string;
  timeframe: OrchestratorTimeframe;
  fromMs: number;
  toMs: number;
}

export async function fetchTradeContextKlines(
  input: FetchTradeContextKlinesInput,
): Promise<Candle[]> {
  return fetchHistoricalKlines(input);
}

export interface FetchHistoricalKlinesInput {
  symbol: string;
  timeframe: OrchestratorTimeframe;
  fromMs: number;
  toMs: number;
}

export async function fetchHistoricalKlines(
  input: FetchHistoricalKlinesInput,
): Promise<Candle[]> {
  const granularity = granularityFor(input.timeframe);
  const granularityMs = granularity * 60 * 1000;
  const byTime = new Map<number, Candle>();

  const fromMs = Math.floor(input.fromMs);
  const toMs = Math.floor(input.toMs);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return [];
  }

  const windowMs = REQUEST_WINDOW_ROWS * granularityMs;
  let cursor = fromMs;

  while (cursor < toMs) {
    const windowTo = Math.min(cursor + windowMs, toMs);
    const rows = await fetchKucoinKlineWindow(
      input.symbol,
      granularity,
      cursor,
      windowTo,
    );

    for (const candle of rows) {
      byTime.set(candle.time, candle);
    }

    const lastSeen = rows.at(-1)?.time;
    const nextCursor = lastSeen
      ? lastSeen + granularityMs
      : windowTo + granularityMs;

    if (nextCursor <= cursor) {
      throw new Error(`KuCoin public kline pagination stalled at ${cursor}`);
    }

    cursor = nextCursor;
  }

  return [...byTime.values()]
    .filter((candle) => candle.time >= fromMs && candle.time <= toMs)
    .sort((a, b) => a.time - b.time);
}

export const kucoinPublicKlineInternals = {
  parseRows,
  granularityFor,
};
