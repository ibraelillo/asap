import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import { buildFeedRegistrySnapshot } from "./feed-registry";
import { getRuntimeSettings } from "./runtime-settings";

const sqs = new SQSClient({});

function getQueueUrl(name: string): string {
  const resources = Resource as unknown as Record<string, { url?: string } | undefined>;
  const url = resources[name]?.url;
  if (typeof url === "string" && url.length > 0) {
    return url;
  }
  throw new Error(`Missing linked Resource.${name}.url`);
}

export async function handler() {
  const runtimeSettings = getRuntimeSettings();
  if (!runtimeSettings.sharedFeedExecutionEnabled) {
    return {
      enabled: false,
      queuedMarketFeeds: 0,
      marketFeeds: 0,
      indicatorFeeds: 0,
    };
  }

  const { snapshot, dueMarketFeeds } = await buildFeedRegistrySnapshot();
  const queueUrl = getQueueUrl("RangingMarketFeedRefreshQueue");

  for (const feed of dueMarketFeeds) {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(feed),
      }),
    );
  }

  return {
    enabled: true,
    queuedMarketFeeds: dueMarketFeeds.length,
    marketFeeds: snapshot.marketFeeds.length,
    indicatorFeeds: snapshot.indicatorFeeds.length,
  };
}
