import type { ExecutionContext } from "@repo/trading-engine";
import { runtimeAccountResolver } from "./account-resolver";
import { exchangeAdapterRegistry } from "./exchange-adapter-registry";
import {
  putPositionRecord,
  putReconciliationEventRecord,
  getLatestOpenPositionByBot,
} from "./monitoring/store";
import type { AccountRecord, BotRecord } from "./monitoring/types";
import { reconcileBotState } from "./reconciliation";
import { loadActiveBots } from "./runtime-bots";

interface ReconciliationEvent {
  trigger?: string;
  symbols?: string;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return {};
}

function parseSymbols(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (symbol): symbol is string =>
        typeof symbol === "string" && symbol.length > 0,
    );
  } catch {
    return raw
      .split(",")
      .map((symbol) => symbol.trim())
      .filter((symbol) => symbol.length > 0);
  }
}

async function buildExecutionContext(
  bot: BotRecord,
): Promise<ExecutionContext<AccountRecord>> {
  const account = await runtimeAccountResolver.requireAccount(
    bot.accountId,
    bot.exchangeId,
  );

  return {
    bot,
    account,
    exchangeId: bot.exchangeId,
    nowMs: Date.now(),
    dryRun: false,
    metadata: {
      accountSource: account.metadata?.source ?? "store",
      mode: "reconciliation",
    },
  };
}

export const handler = async (incomingEvent?: ReconciliationEvent) => {
  const event = asObject(incomingEvent);
  const allowedSymbols = new Set(parseSymbols(event.symbols));

  let bots = await loadActiveBots();
  if (allowedSymbols.size > 0) {
    bots = bots.filter((bot) => allowedSymbols.has(bot.symbol));
  }

  let processed = 0;
  let drifted = 0;
  let restored = 0;
  let failed = 0;

  for (const bot of bots) {
    try {
      const [localPosition, executionContext] = await Promise.all([
        getLatestOpenPositionByBot(bot.id),
        buildExecutionContext(bot),
      ]);
      const executionAdapter = exchangeAdapterRegistry.getPrivate(
        bot.exchangeId,
      );
      const reader = executionAdapter.createPositionReader(executionContext);
      const exchangeSnapshots = await reader.getOpenPositions(bot.symbol);
      const outcome = reconcileBotState({
        bot,
        localPosition: localPosition ?? null,
        exchangeSnapshots,
        nowMs: Date.now(),
      });

      await Promise.allSettled([
        ...outcome.positions.map((position) => putPositionRecord(position)),
        ...outcome.events.map((reconciliationEvent) =>
          putReconciliationEventRecord(reconciliationEvent),
        ),
      ]);

      processed += 1;
      drifted += outcome.events.filter(
        (eventItem) => eventItem.status === "drift",
      ).length;
      restored += outcome.events.filter(
        (eventItem) => eventItem.status === "ok",
      ).length;
    } catch (error) {
      failed += 1;
      console.error("[reconciliation-worker] bot reconciliation failed", {
        botId: bot.id,
        symbol: bot.symbol,
        error,
      });
    }
  }

  const summary = {
    processed,
    drifted,
    restored,
    failed,
    total: bots.length,
    symbolFilterCount: allowedSymbols.size,
  };
  console.log("[reconciliation-worker] summary", summary);
  return summary;
};
