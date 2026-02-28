import type { Candle } from "@repo/trading-engine";
import type {
  ExchangeKlineProvider,
  KlineQuery,
  OrchestratorTimeframe,
} from "../../contracts";
import { getRuntimeSettings } from "../../runtime-settings";

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

type KucoinKlineRow = Array<string | number>;

const REQUEST_WINDOW_ROWS = 500;

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

function parseVolume(row: KucoinKlineRow): number {
  return Number(row[5] ?? 0);
}

function parseRows(
  rows: KucoinKlineRow[],
  limit = Number.MAX_SAFE_INTEGER,
): Candle[] {
  const parsed: Candle[] = [];

  for (const row of rows) {
    try {
      const timestamp = row[0];
      if (timestamp === undefined) {
        continue;
      }

      const time = parseTimestamp(timestamp);
      const { open, high, low, close } = parseOHLC(row);
      const volume = parseVolume(row);

      if (![open, high, low, close, volume].every((v) => Number.isFinite(v))) {
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

  return [...byTime.values()]
    .sort((a, b) => a.time - b.time)
    .slice(-Math.max(1, limit));
}

export class KucoinKlineProvider implements ExchangeKlineProvider {
  constructor(
    private readonly deps: {
      getKlines(query: {
        symbol: string;
        granularity: number;
        from: number;
        to: number;
      }): Promise<KucoinKlineRow[]>;
    } = {
      async getKlines(query) {
        const runtimeSettings = getRuntimeSettings();
        const params = new URLSearchParams({
          symbol: query.symbol,
          granularity: String(query.granularity),
          from: String(query.from),
          to: String(query.to),
        });
        const response = await fetch(
          `${runtimeSettings.kucoinPublicBaseUrl}/api/v1/kline/query?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error(
            `KuCoin public klines request failed (${response.status})`,
          );
        }

        const payload = (await response.json()) as {
          code?: string;
          data?: KucoinKlineRow[];
          msg?: string;
        };

        if (payload.code !== "200000") {
          throw new Error(
            `KuCoin public klines request returned ${payload.msg ?? payload.code ?? "unknown_error"}`,
          );
        }

        return payload.data ?? [];
      },
    },
  ) {}

  async fetchKlines(query: KlineQuery): Promise<Candle[]> {
    const granularity = granularityByTimeframe[query.timeframe];
    const limit = Math.max(1, query.limit);
    const granularityMs = granularity * 60 * 1000;
    const endMs = Math.floor(query.endTimeMs ?? Date.now());
    const startMs = endMs - granularityMs * limit;
    const windowMs = granularityMs * REQUEST_WINDOW_ROWS;

    const byTime = new Map<number, Candle>();
    let cursor = startMs;

    while (cursor < endMs) {
      const toMs = Math.min(cursor + windowMs, endMs);
      const rows = await this.deps.getKlines({
        symbol: query.symbol,
        granularity,
        from: cursor,
        to: toMs,
      });

      const parsed = parseRows(rows);
      for (const candle of parsed) {
        byTime.set(candle.time, candle);
      }

      const lastSeen = parsed.at(-1)?.time;
      const nextCursor = lastSeen
        ? lastSeen + granularityMs
        : toMs + granularityMs;

      if (nextCursor <= cursor) {
        throw new Error(`Kucoin kline pagination stalled at ${cursor}`);
      }

      if (nextCursor >= endMs) {
        break;
      }

      cursor = nextCursor;
    }

    return [...byTime.values()]
      .sort((a, b) => a.time - b.time)
      .slice(-Math.max(1, limit));
  }
}

export const kucoinKlineInternals = {
  parseRows,
  parseOHLC,
};
