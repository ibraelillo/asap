import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { IndicatorFeedSnapshot, Timeframe } from "@repo/trading-engine";
import { Resource } from "sst";

const SNAPSHOT_SCHEMA_VERSION = 1;

interface StoredIndicatorFeedPayload {
  schemaVersion: number;
  exchangeId: string;
  symbol: string;
  timeframe: Timeframe;
  indicatorId: string;
  paramsHash: string;
  generatedAt: string;
  lastComputedCandleTime: number;
  times: number[];
  outputs: Record<string, number[]>;
}

let cachedClient: S3Client | null = null;

function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({});
  return cachedClient;
}

function getBucketName(): string {
  const resources = Resource as unknown as Record<
    string,
    { name?: string } | undefined
  >;
  const fromResource = resources.MarketData?.name;
  if (fromResource && fromResource.trim().length > 0) {
    return fromResource.trim();
  }

  throw new Error("Missing linked Resource.MarketData");
}

function keyPart(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function indicatorPrefix(
  exchangeId: string,
  symbol: string,
  timeframe: Timeframe,
  indicatorId: string,
  paramsHash: string,
): string {
  return `indicators/${keyPart(exchangeId)}/${keyPart(symbol)}/${keyPart(timeframe)}/${keyPart(indicatorId)}/${paramsHash}`;
}

export function buildLatestIndicatorFeedKey(
  exchangeId: string,
  symbol: string,
  timeframe: Timeframe,
  indicatorId: string,
  paramsHash: string,
): string {
  return `${indicatorPrefix(exchangeId, symbol, timeframe, indicatorId, paramsHash)}/latest.json`;
}

function normalizeOutputSeries(output: unknown): number[] {
  const list = Array.isArray(output) ? output : [];
  return list.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  });
}

async function readJsonObject(
  key: string,
): Promise<Record<string, unknown> | null> {
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
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function saveIndicatorFeedSnapshot(input: {
  exchangeId: string;
  symbol: string;
  timeframe: Timeframe;
  indicatorId: string;
  paramsHash: string;
  times: number[];
  outputs: Record<string, number[]>;
  generatedAt?: string;
  lastComputedCandleTime?: number;
}): Promise<IndicatorFeedSnapshot & { storageKey: string }> {
  const times = Array.isArray(input.times)
    ? input.times
        .map((value) => Math.floor(Number(value)))
        .filter((value) => Number.isFinite(value))
    : [];
  const outputs = Object.fromEntries(
    Object.entries(input.outputs).map(([key, values]) => [
      key,
      normalizeOutputSeries(values),
    ]),
  );
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const lastComputedCandleTime =
    input.lastComputedCandleTime ?? times.at(-1) ?? 0;
  const latestKey = buildLatestIndicatorFeedKey(
    input.exchangeId,
    input.symbol,
    input.timeframe,
    input.indicatorId,
    input.paramsHash,
  );

  const payload: StoredIndicatorFeedPayload = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exchangeId: input.exchangeId,
    symbol: input.symbol,
    timeframe: input.timeframe,
    indicatorId: input.indicatorId,
    paramsHash: input.paramsHash,
    generatedAt,
    lastComputedCandleTime,
    times,
    outputs,
  };

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: latestKey,
      Body: JSON.stringify(payload),
      ContentType: "application/json",
      CacheControl: "public,max-age=60",
    }),
  );

  return {
    exchangeId: input.exchangeId,
    symbol: input.symbol,
    timeframe: input.timeframe,
    indicatorId: input.indicatorId,
    paramsHash: input.paramsHash,
    generatedAt,
    lastComputedCandleTime,
    times,
    outputs,
    storageKey: latestKey,
  };
}

export async function loadLatestIndicatorFeedSnapshot(input: {
  exchangeId: string;
  symbol: string;
  timeframe: Timeframe;
  indicatorId: string;
  paramsHash: string;
}): Promise<IndicatorFeedSnapshot | null> {
  const key = buildLatestIndicatorFeedKey(
    input.exchangeId,
    input.symbol,
    input.timeframe,
    input.indicatorId,
    input.paramsHash,
  );
  const payload = await readJsonObject(key);
  if (!payload) return null;

  const outputsInput =
    payload.outputs && typeof payload.outputs === "object"
      ? (payload.outputs as Record<string, unknown>)
      : {};
  const outputs = Object.fromEntries(
    Object.entries(outputsInput).map(([keyPart, value]) => [
      keyPart,
      normalizeOutputSeries(value),
    ]),
  );
  const times = Array.isArray(payload.times)
    ? payload.times
        .map((value) => Math.floor(Number(value)))
        .filter((value) => Number.isFinite(value))
    : [];
  const lastComputedCandleTime = Number(
    payload.lastComputedCandleTime ?? times.at(-1) ?? 0,
  );
  if (!Number.isFinite(lastComputedCandleTime)) {
    return null;
  }

  return {
    exchangeId:
      typeof payload.exchangeId === "string"
        ? payload.exchangeId
        : input.exchangeId,
    symbol: typeof payload.symbol === "string" ? payload.symbol : input.symbol,
    timeframe:
      typeof payload.timeframe === "string"
        ? (payload.timeframe as Timeframe)
        : input.timeframe,
    indicatorId:
      typeof payload.indicatorId === "string"
        ? payload.indicatorId
        : input.indicatorId,
    paramsHash:
      typeof payload.paramsHash === "string"
        ? payload.paramsHash
        : input.paramsHash,
    generatedAt:
      typeof payload.generatedAt === "string"
        ? payload.generatedAt
        : new Date(0).toISOString(),
    lastComputedCandleTime,
    times,
    outputs,
  };
}
