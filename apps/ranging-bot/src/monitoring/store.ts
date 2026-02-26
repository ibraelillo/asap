import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { BotRunRecord } from "./types";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 120;
const TABLE_ENV_KEY = "RANGING_BOT_RUNS_TABLE";
const PK_RUN = "RUN";
const GSI_BY_SYMBOL = "BySymbol";

let cachedDocClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (cachedDocClient) return cachedDocClient;

  const baseClient = new DynamoDBClient({});
  cachedDocClient = DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  return cachedDocClient;
}

function getTableName(): string {
  const fromEnv = process.env[TABLE_ENV_KEY];
  if (fromEnv) return fromEnv;

  const resources = Resource as unknown as Record<string, { name?: string } | undefined>;
  const fromResource = resources.RangingBotRuns?.name;
  if (fromResource) return fromResource;

  throw new Error(
    `Missing table name. Set ${TABLE_ENV_KEY} or link Resource.RangingBotRuns to this function.`,
  );
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function padTime(timestampMs: number): string {
  return String(timestampMs).padStart(13, "0");
}

function sortKey(timestampMs: number, symbol: string): string {
  return `${padTime(timestampMs)}#${symbol}`;
}

function gsiKey(timestampMs: number): string {
  return padTime(timestampMs);
}

function toItem(record: BotRunRecord): Record<string, unknown> {
  return {
    PK: PK_RUN,
    SK: sortKey(record.generatedAtMs, record.symbol),
    GSI1PK: `BOT#${record.symbol}`,
    GSI1SK: gsiKey(record.generatedAtMs),
    ...record,
  };
}

function fromItem(item: Record<string, unknown>): BotRunRecord {
  return {
    symbol: String(item.symbol),
    generatedAtMs: Number(item.generatedAtMs),
    recordedAtMs: Number(item.recordedAtMs),
    runStatus: item.runStatus === "failed" ? "failed" : "ok",
    executionTimeframe: String(item.executionTimeframe) as BotRunRecord["executionTimeframe"],
    primaryRangeTimeframe: String(item.primaryRangeTimeframe) as BotRunRecord["primaryRangeTimeframe"],
    secondaryRangeTimeframe: String(item.secondaryRangeTimeframe) as BotRunRecord["secondaryRangeTimeframe"],
    signal:
      item.signal === "long" || item.signal === "short"
        ? item.signal
        : null,
    reasons: Array.isArray(item.reasons)
      ? item.reasons.filter((value): value is string => typeof value === "string")
      : [],
    price: typeof item.price === "number" ? item.price : undefined,
    rangeVal: typeof item.rangeVal === "number" ? item.rangeVal : undefined,
    rangeVah: typeof item.rangeVah === "number" ? item.rangeVah : undefined,
    rangePoc: typeof item.rangePoc === "number" ? item.rangePoc : undefined,
    rangeIsAligned:
      typeof item.rangeIsAligned === "boolean" ? item.rangeIsAligned : undefined,
    rangeOverlapRatio:
      typeof item.rangeOverlapRatio === "number" ? item.rangeOverlapRatio : undefined,
    bullishDivergence:
      typeof item.bullishDivergence === "boolean" ? item.bullishDivergence : undefined,
    bearishDivergence:
      typeof item.bearishDivergence === "boolean" ? item.bearishDivergence : undefined,
    bullishSfp: typeof item.bullishSfp === "boolean" ? item.bullishSfp : undefined,
    bearishSfp: typeof item.bearishSfp === "boolean" ? item.bearishSfp : undefined,
    moneyFlowSlope: typeof item.moneyFlowSlope === "number" ? item.moneyFlowSlope : undefined,
    processing: {
      status:
        typeof item.processing === "object" && item.processing &&
        typeof (item.processing as { status?: unknown }).status === "string"
          ? ((item.processing as { status: BotRunRecord["processing"]["status"] }).status)
          : "error",
      side:
        typeof item.processing === "object" && item.processing &&
        ((item.processing as { side?: unknown }).side === "long" ||
          (item.processing as { side?: unknown }).side === "short")
          ? ((item.processing as { side: "long" | "short" }).side)
          : undefined,
      message:
        typeof item.processing === "object" && item.processing &&
        typeof (item.processing as { message?: unknown }).message === "string"
          ? (item.processing as { message: string }).message
          : undefined,
      orderId:
        typeof item.processing === "object" && item.processing &&
        typeof (item.processing as { orderId?: unknown }).orderId === "string"
          ? (item.processing as { orderId: string }).orderId
          : undefined,
      clientOid:
        typeof item.processing === "object" && item.processing &&
        typeof (item.processing as { clientOid?: unknown }).clientOid === "string"
          ? (item.processing as { clientOid: string }).clientOid
          : undefined,
    },
    errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : undefined,
  };
}

async function queryRuns(input: QueryCommandInput): Promise<BotRunRecord[]> {
  const client = getDocClient();
  const result = await client.send(new QueryCommand(input));
  const items = (result.Items ?? []) as Record<string, unknown>[];

  return items
    .map((item) => fromItem(item))
    .sort((a, b) => b.generatedAtMs - a.generatedAtMs);
}

export async function putRunRecord(record: BotRunRecord): Promise<void> {
  const client = getDocClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toItem(record),
    }),
  );
}

export async function listRecentRuns(limit?: number): Promise<BotRunRecord[]> {
  const tableName = getTableName();
  return queryRuns({
    TableName: tableName,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": PK_RUN,
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listRecentRunsBySymbol(symbol: string, limit?: number): Promise<BotRunRecord[]> {
  const tableName = getTableName();

  return queryRuns({
    TableName: tableName,
    IndexName: GSI_BY_SYMBOL,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `BOT#${symbol}`,
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listLatestRunsBySymbols(symbols: string[]): Promise<BotRunRecord[]> {
  const uniqueSymbols = [...new Set(symbols.filter((symbol) => symbol.length > 0))];

  const results = await Promise.all(
    uniqueSymbols.map(async (symbol) => {
      const records = await listRecentRunsBySymbol(symbol, 1);
      return records[0];
    }),
  );

  return results
    .filter((record): record is BotRunRecord => Boolean(record))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export async function getRunBySymbolAndTime(
  symbol: string,
  generatedAtMs: number,
): Promise<BotRunRecord | undefined> {
  const tableName = getTableName();

  const records = await queryRuns({
    TableName: tableName,
    IndexName: GSI_BY_SYMBOL,
    KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
    ExpressionAttributeValues: {
      ":pk": `BOT#${symbol}`,
      ":sk": gsiKey(generatedAtMs),
    },
    ScanIndexForward: false,
    Limit: 1,
  });

  return records[0];
}
