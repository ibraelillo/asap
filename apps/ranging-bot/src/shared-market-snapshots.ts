import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Candle, CandleFeedSnapshot, Timeframe } from "@repo/trading-engine";
import { Resource } from "sst";

const SNAPSHOT_SCHEMA_VERSION = 1;

interface StoredMarketFeedPayload {
  schemaVersion: number;
  exchangeId: string;
  symbol: string;
  timeframe: Timeframe;
  fromMs: number;
  toMs: number;
  candles: Candle[];
  generatedAt: string;
  lastClosedCandleTime: number;
}

let cachedClient: S3Client | null = null;

function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({});
  return cachedClient;
}

function getBucketName(): string {
  const resources = Resource as unknown as Record<string, { name?: string } | undefined>;
  const fromResource = resources.MarketData?.name;
  if (fromResource && fromResource.trim().length > 0) {
    return fromResource.trim();
  }

  throw new Error("Missing linked Resource.MarketData");
}

function keyPart(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function marketPrefix(exchangeId: string, symbol: string, timeframe: Timeframe): string {
  return `market/${keyPart(exchangeId)}/${keyPart(symbol)}/${keyPart(timeframe)}`;
}

export function buildLatestMarketFeedKey(
  exchangeId: string,
  symbol: string,
  timeframe: Timeframe,
): string {
  return `${marketPrefix(exchangeId, symbol, timeframe)}/latest.json`;
}

export function buildWindowMarketFeedKey(
  exchangeId: string,
  symbol: string,
  timeframe: Timeframe,
  fromMs: number,
  toMs: number,
): string {
  return `${marketPrefix(exchangeId, symbol, timeframe)}/${fromMs}-${toMs}.json`;
}

function parseCandle(raw: unknown): Candle | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const time = Number(row.time);
  const open = Number(row.open);
  const high = Number(row.high);
  const low = Number(row.low);
  const close = Number(row.close);
  const volume = Number(row.volume ?? 0);

  if (![time, open, high, low, close, volume].every((value) => Number.isFinite(value))) {
    return null;
  }

  return {
    time: Math.floor(time),
    open,
    high,
    low,
    close,
    volume,
  };
}

function normalizeCandles(raw: unknown): Candle[] {
  const list = Array.isArray(raw) ? raw : [];
  const byTime = new Map<number, Candle>();
  for (const entry of list) {
    const candle = parseCandle(entry);
    if (!candle) continue;
    byTime.set(candle.time, candle);
  }
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

async function readJsonObject(key: string): Promise<Record<string, unknown> | null> {
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
  );

  const raw = await response.Body?.transformToString();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function saveMarketFeedSnapshot(input: {
  exchangeId: string;
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  generatedAt?: string;
  lastClosedCandleTime?: number;
}): Promise<CandleFeedSnapshot & { storageKey: string; versionedKey: string }> {
  const candles = normalizeCandles(input.candles);
  const first = candles[0];
  const last = candles.at(-1);
  const fromMs = first?.time ?? 0;
  const toMs = last?.time ?? 0;
  const lastClosedCandleTime = input.lastClosedCandleTime ?? last?.time ?? 0;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const latestKey = buildLatestMarketFeedKey(input.exchangeId, input.symbol, input.timeframe);
  const versionedKey = buildWindowMarketFeedKey(
    input.exchangeId,
    input.symbol,
    input.timeframe,
    fromMs,
    toMs,
  );

  const payload: StoredMarketFeedPayload = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exchangeId: input.exchangeId,
    symbol: input.symbol,
    timeframe: input.timeframe,
    fromMs,
    toMs,
    candles,
    generatedAt,
    lastClosedCandleTime,
  };

  const body = JSON.stringify(payload);

  await Promise.all([
    getS3Client().send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: latestKey,
        Body: body,
        ContentType: "application/json",
        CacheControl: "public,max-age=60",
      }),
    ),
    getS3Client().send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: versionedKey,
        Body: body,
        ContentType: "application/json",
      }),
    ),
  ]);

  return {
    exchangeId: input.exchangeId,
    symbol: input.symbol,
    timeframe: input.timeframe,
    candles,
    fromMs,
    toMs,
    generatedAt,
    lastClosedCandleTime,
    storageKey: latestKey,
    versionedKey,
  };
}

export async function loadLatestMarketFeedSnapshot(input: {
  exchangeId: string;
  symbol: string;
  timeframe: Timeframe;
}): Promise<CandleFeedSnapshot | null> {
  const key = buildLatestMarketFeedKey(input.exchangeId, input.symbol, input.timeframe);
  const payload = await readJsonObject(key);
  if (!payload) return null;

  const candles = normalizeCandles(payload.candles);
  const exchangeId = typeof payload.exchangeId === "string" ? payload.exchangeId : input.exchangeId;
  const symbol = typeof payload.symbol === "string" ? payload.symbol : input.symbol;
  const timeframe = typeof payload.timeframe === "string" ? (payload.timeframe as Timeframe) : input.timeframe;
  const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : new Date(0).toISOString();
  const fromMs = Number(payload.fromMs ?? candles[0]?.time ?? 0);
  const toMs = Number(payload.toMs ?? candles.at(-1)?.time ?? 0);
  const lastClosedCandleTime = Number(payload.lastClosedCandleTime ?? candles.at(-1)?.time ?? 0);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || !Number.isFinite(lastClosedCandleTime)) {
    return null;
  }

  return {
    exchangeId,
    symbol,
    timeframe,
    candles,
    fromMs,
    toMs,
    generatedAt,
    lastClosedCandleTime,
  };
}
