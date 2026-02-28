import type { BotDefinition } from "@repo/trading-engine";
import { parseBotConfigs, toBotDefinition, type RuntimeBotConfig } from "./runtime-config";

export interface RuntimeBotRecord extends BotDefinition {
  runtime: RuntimeBotConfig;
}

export function loadRuntimeBots(raw = process.env.RANGING_BOTS_JSON): RuntimeBotRecord[] {
  return parseBotConfigs(raw)
    .map((runtime) => ({
      ...toBotDefinition(runtime),
      runtime,
    }))
    .filter((bot) => bot.status !== "archived");
}

export function listActiveRuntimeBots(raw = process.env.RANGING_BOTS_JSON): RuntimeBotRecord[] {
  return loadRuntimeBots(raw).filter((bot) => bot.runtime.enabled !== false);
}

export function getRuntimeBotById(
  botId: string,
  raw = process.env.RANGING_BOTS_JSON,
): RuntimeBotRecord | undefined {
  return loadRuntimeBots(raw).find((bot) => bot.id === botId);
}

export function getRuntimeBotBySymbol(
  symbol: string,
  raw = process.env.RANGING_BOTS_JSON,
): RuntimeBotRecord | undefined {
  return loadRuntimeBots(raw).find((bot) => bot.symbol === symbol);
}
