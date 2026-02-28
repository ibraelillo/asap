import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { createIndicatorParamsHash } from "@repo/trading-engine";
import { Resource } from "sst";
import type {
  IndicatorFeedRequirement,
  CandleFeedRequirement,
} from "@repo/trading-engine";
import type {
  IndicatorFeedState,
  MarketFeedState,
} from "./monitoring/types";

export interface BotExecutionCursorRecord {
  botId: string;
  timeframe: string;
  lastProcessedCandleCloseMs: number;
  updatedAtMs: number;
}

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

function getFeedsTableName(): string {
  const resources = Resource as unknown as Record<
    string,
    { name?: string } | undefined
  >;
  const fromResource = resources.RangingFeeds?.name;
  if (fromResource) return fromResource;
  throw new Error("Missing linked Resource.RangingFeeds");
}

function marketFeedPk(exchangeId: string, symbol: string): string {
  return `MARKET#${exchangeId}#${symbol}`;
}

function marketFeedSk(timeframe: string): string {
  return `TF#${timeframe}`;
}

function indicatorFeedPk(
  exchangeId: string,
  symbol: string,
  timeframe: string,
): string {
  return `INDICATOR#${exchangeId}#${symbol}#${timeframe}`;
}

function indicatorFeedSk(indicatorId: string, paramsHash: string): string {
  return `IND#${indicatorId}#${paramsHash}`;
}

function botExecutionCursorPk(botId: string): string {
  return `BOTEXEC#${botId}`;
}

function botExecutionCursorSk(timeframe: string): string {
  return `TF#${timeframe}`;
}

function toMarketFeedItem(record: MarketFeedState): Record<string, unknown> {
  return {
    PK: marketFeedPk(record.exchangeId, record.symbol),
    SK: marketFeedSk(record.timeframe),
    GSI1PK: `MARKET_STATUS#${record.status}`,
    GSI1SK: `${String(record.nextDueAt).padStart(13, "0")}#${record.exchangeId}#${record.symbol}#${record.timeframe}`,
    ...record,
  };
}

function toIndicatorFeedItem(
  record: IndicatorFeedState,
): Record<string, unknown> {
  return {
    PK: indicatorFeedPk(record.exchangeId, record.symbol, record.timeframe),
    SK: indicatorFeedSk(record.indicatorId, record.paramsHash),
    GSI1PK: `INDICATOR_STATUS#${record.status}`,
    GSI1SK: `${String(record.lastComputedAt ?? 0).padStart(13, "0")}#${record.exchangeId}#${record.symbol}#${record.timeframe}`,
    ...record,
  };
}

function asMarketFeedState(
  item: Record<string, unknown>,
): MarketFeedState | null {
  if (
    typeof item.exchangeId !== "string" ||
    typeof item.symbol !== "string" ||
    typeof item.timeframe !== "string" ||
    !item.requirement ||
    typeof item.requirement !== "object"
  ) {
    return null;
  }

  return {
    exchangeId: item.exchangeId,
    symbol: item.symbol,
    timeframe: item.timeframe as MarketFeedState["timeframe"],
    requiredByCount: Number(item.requiredByCount ?? 0),
    maxLookbackBars: Number(item.maxLookbackBars ?? 0),
    lastClosedCandleTime:
      typeof item.lastClosedCandleTime === "number"
        ? item.lastClosedCandleTime
        : undefined,
    lastRefreshedAt:
      typeof item.lastRefreshedAt === "number" ? item.lastRefreshedAt : undefined,
    nextDueAt: Number(item.nextDueAt ?? 0),
    status:
      item.status === "ready" ||
      item.status === "stale" ||
      item.status === "refreshing" ||
      item.status === "error"
        ? item.status
        : "stale",
    storageKey: typeof item.storageKey === "string" ? item.storageKey : undefined,
    candleCount:
      typeof item.candleCount === "number" ? item.candleCount : undefined,
    errorMessage:
      typeof item.errorMessage === "string" ? item.errorMessage : undefined,
    requirement: item.requirement as CandleFeedRequirement,
  };
}

function asIndicatorFeedState(
  item: Record<string, unknown>,
): IndicatorFeedState | null {
  if (
    typeof item.exchangeId !== "string" ||
    typeof item.symbol !== "string" ||
    typeof item.timeframe !== "string" ||
    typeof item.indicatorId !== "string" ||
    typeof item.paramsHash !== "string" ||
    !item.params ||
    typeof item.params !== "object" ||
    !item.requirement ||
    typeof item.requirement !== "object"
  ) {
    return null;
  }

  return {
    exchangeId: item.exchangeId,
    symbol: item.symbol,
    timeframe: item.timeframe as IndicatorFeedState["timeframe"],
    indicatorId: item.indicatorId,
    paramsHash: item.paramsHash,
    params: item.params as Record<string, unknown>,
    requiredByCount: Number(item.requiredByCount ?? 0),
    maxLookbackBars: Number(item.maxLookbackBars ?? 0),
    lastComputedCandleTime:
      typeof item.lastComputedCandleTime === "number"
        ? item.lastComputedCandleTime
        : undefined,
    lastComputedAt:
      typeof item.lastComputedAt === "number" ? item.lastComputedAt : undefined,
    status:
      item.status === "pending" ||
      item.status === "ready" ||
      item.status === "stale" ||
      item.status === "error"
        ? item.status
        : "pending",
    storageKey: typeof item.storageKey === "string" ? item.storageKey : undefined,
    errorMessage:
      typeof item.errorMessage === "string" ? item.errorMessage : undefined,
    requirement: item.requirement as IndicatorFeedRequirement,
  };
}

export async function getMarketFeedState(input: {
  exchangeId: string;
  symbol: string;
  timeframe: string;
}): Promise<MarketFeedState | null> {
  const response = await getDocClient().send(
    new GetCommand({
      TableName: getFeedsTableName(),
      Key: {
        PK: marketFeedPk(input.exchangeId, input.symbol),
        SK: marketFeedSk(input.timeframe),
      },
    }),
  );

  if (!response.Item) return null;
  return asMarketFeedState(response.Item as Record<string, unknown>);
}

export async function putMarketFeedState(record: MarketFeedState): Promise<void> {
  await getDocClient().send(
    new PutCommand({
      TableName: getFeedsTableName(),
      Item: toMarketFeedItem(record),
    }),
  );
}

export async function getIndicatorFeedState(input: {
  exchangeId: string;
  symbol: string;
  timeframe: string;
  indicatorId: string;
  paramsHash: string;
}): Promise<IndicatorFeedState | null> {
  const response = await getDocClient().send(
    new GetCommand({
      TableName: getFeedsTableName(),
      Key: {
        PK: indicatorFeedPk(input.exchangeId, input.symbol, input.timeframe),
        SK: indicatorFeedSk(input.indicatorId, input.paramsHash),
      },
    }),
  );

  if (!response.Item) return null;
  return asIndicatorFeedState(response.Item as Record<string, unknown>);
}

export async function putIndicatorFeedState(
  record: IndicatorFeedState,
): Promise<void> {
  await getDocClient().send(
    new PutCommand({
      TableName: getFeedsTableName(),
      Item: toIndicatorFeedItem(record),
    }),
  );
}

function asBotExecutionCursor(
  item: Record<string, unknown>,
): BotExecutionCursorRecord | null {
  if (typeof item.botId !== "string" || typeof item.timeframe !== "string") {
    return null;
  }

  const lastProcessedCandleCloseMs = Number(item.lastProcessedCandleCloseMs);
  const updatedAtMs = Number(item.updatedAtMs);
  if (
    !Number.isFinite(lastProcessedCandleCloseMs) ||
    !Number.isFinite(updatedAtMs)
  ) {
    return null;
  }

  return {
    botId: item.botId,
    timeframe: item.timeframe,
    lastProcessedCandleCloseMs,
    updatedAtMs,
  };
}

export async function getBotExecutionCursor(input: {
  botId: string;
  timeframe: string;
}): Promise<BotExecutionCursorRecord | null> {
  const response = await getDocClient().send(
    new GetCommand({
      TableName: getFeedsTableName(),
      Key: {
        PK: botExecutionCursorPk(input.botId),
        SK: botExecutionCursorSk(input.timeframe),
      },
    }),
  );

  if (!response.Item) return null;
  return asBotExecutionCursor(response.Item as Record<string, unknown>);
}

export async function advanceBotExecutionCursor(input: {
  botId: string;
  timeframe: string;
  closedCandleTime: number;
}): Promise<void> {
  await getDocClient().send(
    new PutCommand({
      TableName: getFeedsTableName(),
      Item: {
        PK: botExecutionCursorPk(input.botId),
        SK: botExecutionCursorSk(input.timeframe),
        GSI1PK: "BOTEXEC",
        GSI1SK: `${String(input.closedCandleTime).padStart(13, "0")}#${input.botId}#${input.timeframe}`,
        botId: input.botId,
        timeframe: input.timeframe,
        lastProcessedCandleCloseMs: input.closedCandleTime,
        updatedAtMs: Date.now(),
      },
    }),
  );
}

export function buildIndicatorFeedKey(input: {
  exchangeId: string;
  symbol: string;
  timeframe: string;
  indicatorId: string;
  params: Record<string, unknown>;
}): {
  exchangeId: string;
  symbol: string;
  timeframe: string;
  indicatorId: string;
  paramsHash: string;
} {
  return {
    exchangeId: input.exchangeId,
    symbol: input.symbol,
    timeframe: input.timeframe,
    indicatorId: input.indicatorId,
    paramsHash: createIndicatorParamsHash({
      indicatorId: input.indicatorId,
      params: input.params,
    }),
  };
}
