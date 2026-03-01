import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import { buildFeedRegistrySnapshot } from "./feed-registry";
import { getRuntimeSettings } from "./runtime-settings";

const sqs = new SQSClient({});

function getQueueUrl(name: string): string {
  const resources = Resource as unknown as Record<
    string,
    { url?: string } | undefined
  >;
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

  const { snapshot, dueMarketFeeds, dueIndicatorFeeds } =
    await buildFeedRegistrySnapshot();
  const marketQueueUrl = getQueueUrl("RangingMarketFeedRefreshQueue");
  const indicatorQueueUrl = getQueueUrl("RangingIndicatorRefreshQueue");

  for (const feed of dueMarketFeeds) {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: marketQueueUrl,
        MessageBody: JSON.stringify(feed),
      }),
    );
  }

  for (const feed of dueIndicatorFeeds) {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: indicatorQueueUrl,
        MessageBody: JSON.stringify(feed),
      }),
    );
  }

  return {
    enabled: true,
    queuedMarketFeeds: dueMarketFeeds.length,
    queuedIndicatorFeeds: dueIndicatorFeeds.length,
    marketFeeds: snapshot.marketFeeds.length,
    indicatorFeeds: snapshot.indicatorFeeds.length,
  };
}
