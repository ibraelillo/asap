import type {
  BotDefinition,
  ExecutionContext,
  ExchangeSymbolSummary,
} from "@repo/trading-engine";
import { exchangeAdapterRegistry } from "./exchange-adapter-registry";
import {
  loadExchangeSymbolsCache,
  saveExchangeSymbolsCache,
  type StoredSymbolCatalog,
} from "./monitoring/symbol-cache";
import type { AccountRecord } from "./monitoring/types";
import { listAccountRecords } from "./monitoring/store";

function createAccountInspectionBot(account: AccountRecord): BotDefinition {
  const nowMs = Date.now();
  return {
    id: `account-symbol-catalog-${account.id}`,
    name: `Account Symbol Catalog ${account.name}`,
    strategyId: "account-symbol-catalog",
    strategyVersion: "1",
    exchangeId: account.exchangeId,
    accountId: account.id,
    symbol: "ACCOUNT",
    marketType: "futures",
    status: "active",
    execution: {
      trigger: "event",
      executionTimeframe: "1h",
      warmupBars: 0,
    },
    context: {
      primaryPriceTimeframe: "1h",
      additionalTimeframes: [],
      providers: [],
    },
    riskProfileId: `${account.id}:symbol-catalog`,
    strategyConfig: {},
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

function createAccountExecutionContext(
  account: AccountRecord,
): ExecutionContext<AccountRecord> {
  return {
    bot: createAccountInspectionBot(account),
    account,
    exchangeId: account.exchangeId,
    nowMs: Date.now(),
    dryRun: true,
    metadata: {
      source: "symbol-catalog",
    },
  };
}

export async function getCachedExchangeSymbols(
  exchangeId: string,
): Promise<StoredSymbolCatalog | undefined> {
  return loadExchangeSymbolsCache(exchangeId);
}

export async function refreshExchangeSymbolsForAccount(
  account: AccountRecord,
): Promise<StoredSymbolCatalog> {
  const adapter = exchangeAdapterRegistry.get(account.exchangeId);
  if (!adapter.createSymbolReader) {
    throw new Error(
      `Exchange ${account.exchangeId} does not support symbol listing`,
    );
  }

  const reader = adapter.createSymbolReader(
    createAccountExecutionContext(account),
  );
  const symbols = (await reader.listSymbols()) as ExchangeSymbolSummary[];
  const saved = await saveExchangeSymbolsCache({
    exchangeId: account.exchangeId,
    symbols,
  });

  if (!saved) {
    throw new Error("Symbol cache bucket is not configured");
  }

  return saved;
}

export async function refreshActiveExchangeSymbolCatalogs(
  limit = 500,
): Promise<{
  refreshed: string[];
  skipped: string[];
}> {
  const accounts = (await listAccountRecords(limit)).filter(
    (account) => account.status === "active",
  );
  const firstActiveAccountByExchange = new Map<string, AccountRecord>();

  for (const account of accounts) {
    if (!firstActiveAccountByExchange.has(account.exchangeId)) {
      firstActiveAccountByExchange.set(account.exchangeId, account);
    }
  }

  const refreshed: string[] = [];
  const skipped: string[] = [];

  for (const [exchangeId, account] of firstActiveAccountByExchange.entries()) {
    try {
      await refreshExchangeSymbolsForAccount(account);
      refreshed.push(exchangeId);
    } catch (error) {
      console.error("[symbol-catalog] refresh failed", {
        exchangeId,
        accountId: account.id,
        error,
      });
      skipped.push(exchangeId);
    }
  }

  return { refreshed, skipped };
}
