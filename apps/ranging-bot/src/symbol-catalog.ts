import type { ExchangeSymbolSummary } from "@repo/trading-engine";
import { exchangeAdapterRegistry } from "./exchange-adapter-registry";
import {
  loadExchangeSymbolsCache,
  saveExchangeSymbolsCache,
  type StoredSymbolCatalog,
} from "./monitoring/symbol-cache";

export async function getCachedExchangeSymbols(
  exchangeId: string,
): Promise<StoredSymbolCatalog | undefined> {
  return loadExchangeSymbolsCache(exchangeId);
}

export async function refreshExchangeSymbols(
  exchangeId: string,
): Promise<StoredSymbolCatalog> {
  const adapter = exchangeAdapterRegistry.getPublic(exchangeId);
  const reader = adapter.createSymbolReader?.({
    exchangeId,
    nowMs: Date.now(),
    metadata: {
      source: "symbol-catalog",
    },
  });

  if (!reader) {
    throw new Error(`Exchange ${exchangeId} does not support symbol listing`);
  }

  const symbols = (await reader.listSymbols()) as ExchangeSymbolSummary[];
  const saved = await saveExchangeSymbolsCache({
    exchangeId,
    symbols,
  });

  if (!saved) {
    throw new Error("Symbol cache bucket is not configured");
  }

  return saved;
}

export async function refreshActiveExchangeSymbolCatalogs(
): Promise<{
  refreshed: string[];
  skipped: string[];
}> {
  const refreshed: string[] = [];
  const skipped: string[] = [];

  for (const exchangeId of exchangeAdapterRegistry.listExchangeIds()) {
    try {
      await refreshExchangeSymbols(exchangeId);
      refreshed.push(exchangeId);
    } catch (error) {
      console.error("[symbol-catalog] refresh failed", {
        exchangeId,
        error,
      });
      skipped.push(exchangeId);
    }
  }

  return { refreshed, skipped };
}
