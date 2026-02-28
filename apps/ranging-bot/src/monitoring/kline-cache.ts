import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Candle } from "@repo/ranging-core";
import { Resource } from "sst";
import type { OrchestratorTimeframe } from "../contracts";
import { getRuntimeSettings } from "../runtime-settings";
import type { KlineCacheReference } from "./types";

const BUCKET_ENV_KEY = "RANGING_KLINES_BUCKET";
const CACHE_SCHEMA_VERSION = 1;

let cachedClient: S3Client | null = null;

interface StoredKlinePayload {
  schemaVersion: number;
  symbol: string;
  timeframe: OrchestratorTimeframe;
  fromMs: number;
  toMs: number;
  candles: Candle[];
  generatedAt: string;
}

export interface SaveBacktestKlineCacheInput {
  backtestId: string;
  symbol: string;
  timeframe: OrchestratorTimeframe;
  fromMs: number;
  toMs: number;
  candles: Candle[];
}

function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({});
  return cachedClient;
}

function getBucketName(): string | undefined {
  const fromEnv = process.env[BUCKET_ENV_KEY];
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  const resources = Resource as unknown as Record<
    string,
    { name?: string } | undefined
  >;
  const fromResource = resources.RangingKlineCache?.name;
  if (fromResource && fromResource.trim().length > 0) {
    return fromResource.trim();
  }

  return undefined;
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

  if (
    ![time, open, high, low, close, volume].every((value) =>
      Number.isFinite(value),
    )
  ) {
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
  const list = Array.isArray(raw)
    ? raw
    : raw &&
        typeof raw === "object" &&
        Array.isArray((raw as { candles?: unknown[] }).candles)
      ? (raw as { candles: unknown[] }).candles
      : [];

  const byTime = new Map<number, Candle>();
  for (const item of list) {
    const candle = parseCandle(item);
    if (!candle) continue;
    byTime.set(candle.time, candle);
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function parseJsonSafely(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
}

function keyPart(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function toPublicUrl(key: string): string | undefined {
  const base = getRuntimeSettings().klinesPublicBaseUrl?.trim();
  if (!base) return undefined;

  const normalized = base.replace(/\/+$/, "");
  const encoded = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${normalized}/${encoded}`;
}

function toReference(
  key: string,
  symbol: string,
  timeframe: OrchestratorTimeframe,
  fromMs: number,
  toMs: number,
  candleCount: number,
): KlineCacheReference {
  return {
    key,
    symbol,
    timeframe,
    fromMs,
    toMs,
    candleCount,
    url: toPublicUrl(key),
  };
}

export function buildWindowKlineCacheKey(
  symbol: string,
  timeframe: OrchestratorTimeframe,
  fromMs: number,
  toMs: number,
): string {
  const safeSymbol = keyPart(symbol);
  const safeTimeframe = keyPart(timeframe);
  return `windows/${safeSymbol}/${safeTimeframe}/${fromMs}-${toMs}.json`;
}

export function buildBacktestKlineCacheKey(
  backtestId: string,
  symbol: string,
  timeframe: OrchestratorTimeframe,
  fromMs: number,
  toMs: number,
): string {
  const safeBacktestId = keyPart(backtestId);
  const safeSymbol = keyPart(symbol);
  const safeTimeframe = keyPart(timeframe);
  return `backtests/${safeBacktestId}/${safeSymbol}/${safeTimeframe}/${fromMs}-${toMs}.json`;
}

export function findMatchingKlineRef(
  refs: KlineCacheReference[] | undefined,
  symbol: string,
  timeframe: OrchestratorTimeframe,
  fromMs: number,
  toMs: number,
): KlineCacheReference | undefined {
  if (!refs || refs.length === 0) return undefined;

  return refs.find(
    (ref) =>
      ref.symbol === symbol &&
      ref.timeframe === timeframe &&
      ref.fromMs === fromMs &&
      ref.toMs === toMs &&
      typeof ref.key === "string" &&
      ref.key.length > 0,
  );
}

export async function saveBacktestKlineCache(
  input: SaveBacktestKlineCacheInput,
): Promise<KlineCacheReference | undefined> {
  const bucket = getBucketName();
  if (!bucket) return undefined;

  const candles = normalizeCandles(input.candles);
  const backtestKey = buildBacktestKlineCacheKey(
    input.backtestId,
    input.symbol,
    input.timeframe,
    input.fromMs,
    input.toMs,
  );
  const windowKey = buildWindowKlineCacheKey(
    input.symbol,
    input.timeframe,
    input.fromMs,
    input.toMs,
  );
  const payload: StoredKlinePayload = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    symbol: input.symbol,
    timeframe: input.timeframe,
    fromMs: input.fromMs,
    toMs: input.toMs,
    candles,
    generatedAt: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const putInput = {
    Bucket: bucket,
    Body: body,
    ContentType: "application/json; charset=utf-8",
    CacheControl: "public, max-age=31536000, immutable",
  };

  await Promise.all([
    getS3Client().send(
      new PutObjectCommand({
        ...putInput,
        Key: backtestKey,
      }),
    ),
    getS3Client().send(
      new PutObjectCommand({
        ...putInput,
        Key: windowKey,
      }),
    ),
  ]);

  return toReference(
    windowKey,
    input.symbol,
    input.timeframe,
    input.fromMs,
    input.toMs,
    candles.length,
  );
}

export async function loadCandlesFromCacheRef(
  ref: KlineCacheReference,
): Promise<Candle[] | undefined> {
  return loadCandlesFromCacheKey(ref.key);
}

export async function loadCandlesFromCacheKey(
  key: string,
): Promise<Candle[] | undefined> {
  const bucket = getBucketName();
  if (!bucket) return undefined;
  if (!key || key.trim().length === 0) return undefined;

  try {
    const result = await getS3Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const body = result.Body;
    if (!body || typeof body !== "object" || !("transformToString" in body)) {
      return undefined;
    }

    const content = await (
      body as { transformToString: () => Promise<string> }
    ).transformToString();
    const parsed = parseJsonSafely(content);
    const candles = normalizeCandles(parsed);
    if (candles.length === 0) {
      return undefined;
    }

    return candles;
  } catch {
    return undefined;
  }
}

export function normalizeKlineReference(
  ref: KlineCacheReference,
): KlineCacheReference {
  return {
    ...ref,
    url: toPublicUrl(ref.key) ?? ref.url,
  };
}
