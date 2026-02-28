import {
  createKucoinClient,
  createKucoinService,
  type KucoinClient,
  type KucoinService,
} from "@repo/kucoin";
import type { ExchangeAdapter, ExecutionContext } from "@repo/trading-engine";
import { KucoinAccountBalanceReader } from "./exchanges/kucoin/account-balance-reader";
import { KucoinAccountSymbolReader } from "./exchanges/kucoin/account-symbol-reader";
import type { KucoinSignalProcessorOptions } from "./exchanges/kucoin/signal-processor";
import { KucoinKlineProvider } from "./exchanges/kucoin/klines";
import { KucoinPositionReader } from "./exchanges/kucoin/position-reader";
import { KucoinSignalProcessor } from "./exchanges/kucoin/signal-processor";
import type { AccountRecord } from "./monitoring/types";

type KucoinRuntimeHandle = {
  client: KucoinClient;
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
  const runtime = { client, service };
  kucoinRuntimeCache.set(cacheKey, runtime);
  return runtime;
}

const kucoinAdapter: ExchangeAdapter<AccountRecord> = {
  id: "kucoin",
  createKlineProvider(context: ExecutionContext<AccountRecord>) {
    const { client } = getKucoinRuntime(context.account);
    return new KucoinKlineProvider(client);
  },
  createAccountBalanceReader(context: ExecutionContext<AccountRecord>) {
    const { service } = getKucoinRuntime(context.account);
    return new KucoinAccountBalanceReader(service);
  },
  createSymbolReader(context: ExecutionContext<AccountRecord>) {
    const { service } = getKucoinRuntime(context.account);
    return new KucoinAccountSymbolReader(service);
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
  get(exchangeId: string): ExchangeAdapter<AccountRecord>;
}

export const exchangeAdapterRegistry: ExchangeAdapterRegistry = {
  get(exchangeId) {
    if (exchangeId === "kucoin") {
      return kucoinAdapter;
    }

    throw new Error(`Unsupported exchange adapter: ${exchangeId}`);
  },
};
