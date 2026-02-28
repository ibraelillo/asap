import {
  createKucoinClient,
  createKucoinService,
  type KucoinService,
} from "@repo/kucoin";
import type {
  ExecutionContext,
  PrivateExecutionAdapter,
  PublicMarketDataAdapter,
} from "@repo/trading-engine";
import { KucoinAccountBalanceReader } from "./exchanges/kucoin/account-balance-reader";
import type { KucoinSignalProcessorOptions } from "./exchanges/kucoin/signal-processor";
import { KucoinKlineProvider } from "./exchanges/kucoin/klines";
import { KucoinPositionReader } from "./exchanges/kucoin/position-reader";
import { KucoinPublicSymbolReader } from "./exchanges/kucoin/public-symbol-reader";
import { KucoinSignalProcessor } from "./exchanges/kucoin/signal-processor";
import type { AccountRecord } from "./monitoring/types";

type KucoinRuntimeHandle = {
  service: KucoinService;
};

const kucoinRuntimeCache = new Map<string, KucoinRuntimeHandle>();

function getKucoinRuntime(account: AccountRecord): KucoinRuntimeHandle {
  if (
    !account.auth.apiKey ||
    !account.auth.apiSecret ||
    !account.auth.apiPassphrase
  ) {
    throw new Error(`Incomplete KuCoin credentials for account ${account.id}`);
  }

  const cacheKey = `${account.exchangeId}:${account.id}`;
  const cached = kucoinRuntimeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = createKucoinClient({
    apiKey: account.auth.apiKey,
    apiSecret: account.auth.apiSecret,
    passphrase: account.auth.apiPassphrase,
  });
  const service = createKucoinService(client);
  const runtime = { service };
  kucoinRuntimeCache.set(cacheKey, runtime);
  return runtime;
}

const kucoinPublicAdapter: PublicMarketDataAdapter = {
  id: "kucoin",
  createSymbolReader() {
    return new KucoinPublicSymbolReader();
  },
  createKlineProvider() {
    return new KucoinKlineProvider();
  },
};

const kucoinPrivateAdapter: PrivateExecutionAdapter<AccountRecord> = {
  id: "kucoin",
  createAccountBalanceReader(context: ExecutionContext<AccountRecord>) {
    const { service } = getKucoinRuntime(context.account);
    return new KucoinAccountBalanceReader(service);
  },
  createPositionReader(context: ExecutionContext<AccountRecord>) {
    const { service } = getKucoinRuntime(context.account);
    return new KucoinPositionReader(service);
  },
  createSignalProcessor<TSnapshot = unknown, TMeta = unknown>(
    context: ExecutionContext<AccountRecord>,
    options?: Record<string, unknown>,
  ) {
    const { service } = getKucoinRuntime(context.account);
    return new KucoinSignalProcessor<TSnapshot, TMeta>(
      service,
      options as KucoinSignalProcessorOptions | undefined,
    );
  },
};

export interface ExchangeAdapterRegistry {
  getPublic(exchangeId: string): PublicMarketDataAdapter;
  getPrivate(exchangeId: string): PrivateExecutionAdapter<AccountRecord>;
  listExchangeIds(): string[];
}

export const exchangeAdapterRegistry: ExchangeAdapterRegistry = {
  getPublic(exchangeId) {
    if (exchangeId === "kucoin") {
      return kucoinPublicAdapter;
    }

    throw new Error(`Unsupported public exchange adapter: ${exchangeId}`);
  },
  getPrivate(exchangeId) {
    if (exchangeId === "kucoin") {
      return kucoinPrivateAdapter;
    }

    throw new Error(`Unsupported private exchange adapter: ${exchangeId}`);
  },
  listExchangeIds() {
    return ["kucoin"];
  },
};
