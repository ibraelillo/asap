import { listActiveRuntimeBots } from "./bot-registry";
import { listBotRecords, putBotRecord } from "./monitoring/store";
import type { BotRecord } from "./monitoring/types";

export async function loadActiveBots(
  rawBotsJson?: string,
): Promise<BotRecord[]> {
  const runtimeBots = listActiveRuntimeBots(rawBotsJson);
  await Promise.allSettled(runtimeBots.map((bot) => putBotRecord(bot)));

  const storedBots = await listBotRecords(500);
  const byId = new Map<string, BotRecord>();

  for (const bot of storedBots) {
    if (bot.status === "active") {
      byId.set(bot.id, bot);
    }
  }

  for (const bot of runtimeBots) {
    if (bot.status === "active") {
      byId.set(bot.id, bot);
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
