import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOC_ENDPOINT = "/api/v1/kline/query";
const DEFAULT_BASE_URL = "https://api-futures.kucoin.com";
const DEFAULT_SYMBOL = "XBTUSDTM";
const DEFAULT_GRANULARITY_MINUTES = 60;
const DEFAULT_MONTHS = 3;
const REQUEST_WINDOW_ROWS = 500;

function parseArgs(argv) {
  const out = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=", 2);
    if (!key) continue;
    out[key] = value ?? "true";
  }

  return out;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parseTimestampMs(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid kline timestamp: ${raw}`);
  }

  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function parseOHLC(row) {
  if (!Array.isArray(row) || row.length < 5) {
    throw new Error(`Invalid kline row length: ${Array.isArray(row) ? row.length : "n/a"}`);
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

function parseRows(rows) {
  const candles = [];

  for (const row of rows) {
    try {
      const time = parseTimestampMs(row[0]);
      const { open, high, low, close } = parseOHLC(row);
      const volume = Number(row[5] ?? 0);

      if (![open, high, low, close, volume].every((value) => Number.isFinite(value))) {
        continue;
      }

      candles.push({ time, open, high, low, close, volume });
    } catch {
      // Ignore malformed rows and keep fetching.
    }
  }

  return candles;
}

function subtractMonthsUtc(base, months) {
  const next = new Date(base.getTime());
  next.setUTCMonth(next.getUTCMonth() - months);
  return next;
}

async function fetchKlinePage(baseUrl, symbol, granularityMinutes, fromMs, toMs) {
  const params = new URLSearchParams({
    symbol,
    granularity: String(granularityMinutes),
    from: String(fromMs),
    to: String(toMs),
  });

  const response = await fetch(`${baseUrl}${DOC_ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`KuCoin kline request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.code !== "200000") {
    throw new Error(`KuCoin kline query failed: ${json.msg ?? json.code}`);
  }

  return Array.isArray(json.data) ? json.data : [];
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, "../../..");

  const baseUrl = cli.baseUrl ?? DEFAULT_BASE_URL;
  const symbol = cli.symbol ?? DEFAULT_SYMBOL;
  const granularityMinutes = Number(cli.granularity ?? DEFAULT_GRANULARITY_MINUTES);
  const months = Number(cli.months ?? DEFAULT_MONTHS);
  const pauseMs = Number(cli.pauseMs ?? 120);

  if (!Number.isFinite(granularityMinutes) || granularityMinutes <= 0) {
    throw new Error(`Invalid --granularity: ${cli.granularity}`);
  }

  if (!Number.isFinite(months) || months <= 0) {
    throw new Error(`Invalid --months: ${cli.months}`);
  }

  const now = new Date();
  const startDate = subtractMonthsUtc(now, months);
  const endMs = Math.floor(now.getTime());
  const startMs = Math.floor(startDate.getTime());

  const defaultOut = resolve(
    repoRoot,
    "packages/ranging-core/tests/fixtures/kucoin-futures-XBTUSDTM-1h-last-3months.json",
  );
  const outputPath = cli.out ? resolve(process.cwd(), cli.out) : defaultOut;

  const granularityMs = granularityMinutes * 60 * 1000;
  const chunkSpanMs = granularityMs * REQUEST_WINDOW_ROWS;
  const rowsByTime = new Map();

  let cursor = startMs;
  let page = 0;

  while (cursor < endMs) {
    const toMs = Math.min(cursor + chunkSpanMs, endMs);
    page += 1;

    console.info(
      `[kucoin-klines] page=${page} symbol=${symbol} granularity=${granularityMinutes}m from=${cursor} to=${toMs}`,
    );

    const rawRows = await fetchKlinePage(baseUrl, symbol, granularityMinutes, cursor, toMs);
    const parsed = parseRows(rawRows).sort((a, b) => a.time - b.time);

    console.info(`[kucoin-klines] page=${page} rawRows=${rawRows.length} parsed=${parsed.length}`);

    for (const candle of parsed) {
      rowsByTime.set(candle.time, candle);
    }

    const lastSeenMs = parsed.at(-1)?.time;
    const nextCursor = lastSeenMs ? lastSeenMs + granularityMs : toMs + granularityMs;

    if (nextCursor <= cursor) {
      throw new Error(`Pagination stalled at cursor=${cursor}, next=${nextCursor}`);
    }

    if (nextCursor >= endMs) {
      break;
    }

    cursor = nextCursor;

    if (pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  const candles = [...rowsByTime.values()]
    .sort((a, b) => a.time - b.time)
    .filter((candle) => candle.time >= startMs && candle.time <= endMs);

  const fixture = {
    exchange: "kucoin-futures",
    endpoint: DOC_ENDPOINT,
    symbol,
    granularityMinutes,
    months,
    startMs,
    endMs,
    fetchedAt: now.toISOString(),
    candleCount: candles.length,
    candles,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

  const first = candles[0];
  const last = candles.at(-1);

  console.info(`[kucoin-klines] wrote fixture=${outputPath}`);
  console.info(
    `[kucoin-klines] candles=${candles.length} first=${first?.time ?? "n/a"} last=${last?.time ?? "n/a"}`,
  );
}

main().catch((error) => {
  console.error("[kucoin-klines] failed", error);
  process.exit(1);
});
