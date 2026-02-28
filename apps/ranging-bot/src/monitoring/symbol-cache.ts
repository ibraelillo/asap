import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ExchangeSymbolSummary } from "@repo/trading-engine";
import { Resource } from "sst";
import { getRuntimeSettings } from "../runtime-settings";

const BUCKET_ENV_KEY = "RANGING_KLINES_BUCKET";
const CACHE_SCHEMA_VERSION = 1;

let cachedClient: S3Client | null = null;

interface StoredSymbolPayload {
  schemaVersion: number;
  exchangeId: string;
  symbols: ExchangeSymbolSummary[];
  generatedAt: string;
}

export interface StoredSymbolCatalog {
  exchangeId: string;
  symbols: ExchangeSymbolSummary[];
  generatedAt: string;
  key: string;
  url?: string;
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

function parseJsonSafely(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function keyPart(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function toPublicUrl(key: string): string | undefined {
  const base = getRuntimeSettings().symbolsPublicBaseUrl?.trim();
  if (!base) return undefined;

  const normalized = base.replace(/\/+$/, "");
  const publicKey = key.startsWith("symbols/") ? key.slice("symbols/".length) : key;
  const encoded = publicKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${normalized}/${encoded}`;
}

function normalizeSymbolSummary(raw: unknown): ExchangeSymbolSummary | null {
  if (!raw || typeof raw !== "object") return null;

  const row = raw as Record<string, unknown>;
  const symbol = typeof row.symbol === "string" ? row.symbol.trim() : "";
  if (symbol.length === 0) return null;

  const maxLeverage = Number(row.maxLeverage);
  return {
    symbol,
    baseCurrency:
      typeof row.baseCurrency === "string" ? row.baseCurrency : undefined,
    quoteCurrency:
      typeof row.quoteCurrency === "string" ? row.quoteCurrency : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    maxLeverage: Number.isFinite(maxLeverage) ? maxLeverage : undefined,
    supportCross:
      typeof row.supportCross === "boolean" ? row.supportCross : undefined,
    raw:
      row.raw && typeof row.raw === "object"
        ? (row.raw as Record<string, unknown>)
        : undefined,
  };
}

function normalizeSymbols(raw: unknown): ExchangeSymbolSummary[] {
  const rows =
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { symbols?: unknown[] }).symbols)
      ? (raw as { symbols: unknown[] }).symbols
      : Array.isArray(raw)
        ? raw
        : [];

  const bySymbol = new Map<string, ExchangeSymbolSummary>();
  for (const row of rows) {
    const symbol = normalizeSymbolSummary(row);
    if (!symbol) continue;
    bySymbol.set(symbol.symbol, symbol);
  }

  return [...bySymbol.values()].sort((left, right) =>
    left.symbol.localeCompare(right.symbol),
  );
}

export function buildLatestExchangeSymbolsCacheKey(exchangeId: string): string {
  return `symbols/${keyPart(exchangeId)}/latest.json`;
}

export function buildDailyExchangeSymbolsCacheKey(
  exchangeId: string,
  date = new Date(),
): string {
  const isoDate = date.toISOString().slice(0, 10);
  return `symbols/${keyPart(exchangeId)}/${isoDate}.json`;
}

export async function saveExchangeSymbolsCache(input: {
  exchangeId: string;
  symbols: ExchangeSymbolSummary[];
  generatedAt?: string;
}): Promise<StoredSymbolCatalog | undefined> {
  const bucket = getBucketName();
  if (!bucket) return undefined;

  const symbols = normalizeSymbols(input.symbols);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const payload: StoredSymbolPayload = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    exchangeId: input.exchangeId,
    symbols,
    generatedAt,
  };

  const body = JSON.stringify(payload);
  const latestKey = buildLatestExchangeSymbolsCacheKey(input.exchangeId);
  const dailyKey = buildDailyExchangeSymbolsCacheKey(
    input.exchangeId,
    new Date(generatedAt),
  );

  await Promise.all([
    getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: latestKey,
        Body: body,
        ContentType: "application/json; charset=utf-8",
        CacheControl: "public, max-age=3600, stale-while-revalidate=86400",
      }),
    ),
    getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: dailyKey,
        Body: body,
        ContentType: "application/json; charset=utf-8",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    ),
  ]);

  return {
    exchangeId: input.exchangeId,
    symbols,
    generatedAt,
    key: latestKey,
    url: toPublicUrl(latestKey),
  };
}

export async function loadExchangeSymbolsCache(
  exchangeId: string,
): Promise<StoredSymbolCatalog | undefined> {
  const bucket = getBucketName();
  if (!bucket) return undefined;

  const key = buildLatestExchangeSymbolsCacheKey(exchangeId);

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
    const parsed = parseJsonSafely(
      content,
    ) as Partial<StoredSymbolPayload> | null;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    return {
      exchangeId:
        typeof parsed.exchangeId === "string" ? parsed.exchangeId : exchangeId,
      symbols: normalizeSymbols(parsed.symbols),
      generatedAt:
        typeof parsed.generatedAt === "string"
          ? parsed.generatedAt
          : new Date(0).toISOString(),
      key,
      url: toPublicUrl(key),
    };
  } catch {
    return undefined;
  }
}
