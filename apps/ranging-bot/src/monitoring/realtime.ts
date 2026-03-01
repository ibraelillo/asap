import {
  IoTDataPlaneClient,
  PublishCommand,
} from "@aws-sdk/client-iot-data-plane";
import { Resource } from "sst";
import type { BotRunRecord } from "./types";

interface RealtimeConfig {
  endpoint: string;
  topicPrefix: string;
}

let cachedClient: IoTDataPlaneClient | null = null;
let cachedEndpoint: string | null = null;

function getResourceConfig(): Partial<RealtimeConfig> {
  try {
    const resources = Resource as unknown as Record<
      string,
      { endpoint?: string } | undefined
    >;

    return {
      endpoint: resources.RangingRealtime?.endpoint,
    };
  } catch {
    return {};
  }
}

function getRealtimeConfig(): RealtimeConfig | null {
  const fromResource = getResourceConfig();
  const endpoint = fromResource.endpoint;

  if (!endpoint) {
    return null;
  }

  const topicPrefix = `${Resource.App.name}/${Resource.App.stage}/ranging-bot`;

  return {
    endpoint,
    topicPrefix,
  };
}

function getIotClient(endpoint: string): IoTDataPlaneClient {
  if (cachedClient && cachedEndpoint === endpoint) {
    return cachedClient;
  }

  cachedEndpoint = endpoint;
  cachedClient = new IoTDataPlaneClient({
    endpoint: `https://${endpoint}`,
  });

  return cachedClient;
}

async function publish(topic: string, payload: unknown): Promise<void> {
  const config = getRealtimeConfig();
  if (!config) return;

  const client = getIotClient(config.endpoint);
  await client.send(
    new PublishCommand({
      topic,
      qos: 0,
      payload: Buffer.from(JSON.stringify(payload), "utf-8"),
    }),
  );
}

export async function publishRunRecord(record: BotRunRecord): Promise<void> {
  const config = getRealtimeConfig();
  if (!config) return;

  const payload = {
    type: "run",
    record,
  };

  const topics = [
    `${config.topicPrefix}/runs`,
    `${config.topicPrefix}/symbols/${record.symbol}`,
  ];

  await Promise.allSettled(topics.map((topic) => publish(topic, payload)));
}

export async function publishTickSummary(
  summary: Record<string, unknown>,
): Promise<void> {
  const config = getRealtimeConfig();
  if (!config) return;

  await publish(`${config.topicPrefix}/summary`, {
    type: "summary",
    summary,
  });
}

export async function publishFeedUpdate(update: {
  kind: "market" | "indicator";
  exchangeId: string;
  symbol: string;
  timeframe: string;
  indicatorId?: string;
  paramsHash?: string;
  status: string;
  updatedAt: number;
  errorMessage?: string;
}): Promise<void> {
  const config = getRealtimeConfig();
  if (!config) return;

  const payload = {
    type: "feed",
    update,
  };

  const topics = [
    `${config.topicPrefix}/feeds`,
    `${config.topicPrefix}/symbols/${update.symbol}/feeds`,
  ];

  await Promise.allSettled(topics.map((topic) => publish(topic, payload)));
}
