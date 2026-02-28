import { listBotRecords } from "./monitoring/store";
import type { BotRecord } from "./monitoring/types";

export async function loadConfiguredBots(): Promise<BotRecord[]> {
  return (await listBotRecords(500)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export async function loadActiveBots(): Promise<BotRecord[]> {
  return (await loadConfiguredBots()).filter((bot) => bot.status === "active");
}
