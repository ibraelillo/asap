/// <reference path="./../../sst-env.d.ts" />

import { bus } from "sst/aws/bus";
import { createKucoinClient, createKucoinService } from "@repo/kucoin";
import { Resource } from "sst";
import { OrderChanged } from "@repo/events";
import { BotConfigRepository } from "@repo/bot-config";

const repo = new BotConfigRepository(Resource.Bots.name);

const service = createKucoinService(
  createKucoinClient({
    apiKey: Resource.Kucoin.apiKey,
    apiSecret: Resource.Kucoin.apiSecret,
    passphrase: Resource.Kucoin.passphrase,
  }),
);

/**
 *
 */
export const handler = bus.subscriber(OrderChanged, async (e) => {
  console.log(e);

  // Example: Get bot config for the symbol in the event
  // const config = await botRepo.get(e.detail.symbol, 'LONG');
});
