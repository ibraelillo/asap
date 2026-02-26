import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type {
  BacktestRecord,
  BotRunRecord,
  KlineCacheReference,
} from "./types";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 120;
const TABLE_ENV_KEY = "RANGING_BOT_RUNS_TABLE";
const PK_RUN = "RUN";
const PK_BACKTEST = "BACKTEST";
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

function toBacktestItem(record: BacktestRecord): Record<string, unknown> {
  return {
    PK: PK_BACKTEST,
    SK: sortKey(record.createdAtMs, record.id),
    GSI1PK: `BACKTEST#${record.symbol}`,
    GSI1SK: gsiKey(record.createdAtMs),
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

function fromBacktestItem(item: Record<string, unknown>): BacktestRecord {
  const rawRefs = Array.isArray(item.klineRefs) ? item.klineRefs : [];
  const klineRefs = rawRefs
    .map((entry): KlineCacheReference | undefined => {
      if (!entry || typeof entry !== "object") return undefined;
      const row = entry as Record<string, unknown>;

      const key = typeof row.key === "string" ? row.key : undefined;
      const symbol = typeof row.symbol === "string" ? row.symbol : undefined;
      const timeframe =
        typeof row.timeframe === "string"
          ? (row.timeframe as KlineCacheReference["timeframe"])
          : undefined;
      const fromMs = Number(row.fromMs);
      const toMs = Number(row.toMs);
      const candleCount = Number(row.candleCount);

      if (
        !key ||
        !symbol ||
        !timeframe ||
        !Number.isFinite(fromMs) ||
        !Number.isFinite(toMs) ||
        !Number.isFinite(candleCount)
      ) {
        return undefined;
      }

      return {
        key,
        symbol,
        timeframe,
        fromMs,
        toMs,
        candleCount,
        url: typeof row.url === "string" ? row.url : undefined,
      };
    })
    .filter((entry): entry is KlineCacheReference => Boolean(entry));

  return {
    id: String(item.id),
    createdAtMs: Number(item.createdAtMs),
    status: item.status === "failed" ? "failed" : "completed",
    symbol: String(item.symbol),
    fromMs: Number(item.fromMs),
    toMs: Number(item.toMs),
    executionTimeframe: String(item.executionTimeframe) as BacktestRecord["executionTimeframe"],
    primaryRangeTimeframe: String(item.primaryRangeTimeframe) as BacktestRecord["primaryRangeTimeframe"],
    secondaryRangeTimeframe: String(item.secondaryRangeTimeframe) as BacktestRecord["secondaryRangeTimeframe"],
    initialEquity: Number(item.initialEquity),
    totalTrades: Number(item.totalTrades),
    wins: Number(item.wins),
    losses: Number(item.losses),
    winRate: Number(item.winRate),
    netPnl: Number(item.netPnl),
    grossProfit: Number(item.grossProfit),
    grossLoss: Number(item.grossLoss),
    maxDrawdownPct: Number(item.maxDrawdownPct),
    endingEquity: Number(item.endingEquity),
    klineRefs,
    errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : undefined,
  };
}

async function queryItems(input: QueryCommandInput): Promise<Record<string, unknown>[]> {
  const client = getDocClient();
  const result = await client.send(new QueryCommand(input));
  return (result.Items ?? []) as Record<string, unknown>[];
}

async function queryRuns(input: QueryCommandInput): Promise<BotRunRecord[]> {
  const items = await queryItems(input);

  return items
    .map((item) => fromItem(item))
    .sort((a, b) => b.generatedAtMs - a.generatedAtMs);
}

async function queryBacktests(input: QueryCommandInput): Promise<BacktestRecord[]> {
  const items = await queryItems(input);

  return items
    .map((item) => fromBacktestItem(item))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
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

export async function putBacktestRecord(record: BacktestRecord): Promise<void> {
  const client = getDocClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: toBacktestItem(record),
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

export async function listRecentBacktests(limit?: number): Promise<BacktestRecord[]> {
  const tableName = getTableName();
  return queryBacktests({
    TableName: tableName,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": PK_BACKTEST,
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

export async function listRecentBacktestsBySymbol(
  symbol: string,
  limit?: number,
): Promise<BacktestRecord[]> {
  const tableName = getTableName();

  return queryBacktests({
    TableName: tableName,
    IndexName: GSI_BY_SYMBOL,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `BACKTEST#${symbol}`,
    },
    ScanIndexForward: false,
    Limit: normalizeLimit(limit),
  });
}

function parseCreatedAtMsFromBacktestId(id: string): number | undefined {
  const match = /-(\d{13})-[^-]+$/.exec(id);
  if (!match?.[1]) return undefined;

  const createdAtMs = Number(match[1]);
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return undefined;
  return createdAtMs;
}

export async function getBacktestById(id: string): Promise<BacktestRecord | undefined> {
  const createdAtMs = parseCreatedAtMsFromBacktestId(id);
  if (!createdAtMs) return undefined;

  const tableName = getTableName();
  const client = getDocClient();

  const result = await client.send(new GetCommand({
    TableName: tableName,
    Key: {
      PK: PK_BACKTEST,
      SK: sortKey(createdAtMs, id),
    },
  }));

  if (!result.Item) return undefined;
  return fromBacktestItem(result.Item as Record<string, unknown>);
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
