// ---------- Core Client ----------
import { HttpClient, Logger, TimeProvider, UuidProvider } from "./types.js";
import {
  consoleLogger,
  fetchHttpClient,
  nodeUuid,
  systemTime,
} from "./adapters";
import { signRequest } from "./signer";

export type KucoinKlineRow = Array<string | number>;

export interface KucoinKlineQuery {
  symbol: string;
  granularity: number;
  from: number;
  to: number;
}

interface KucoinKlineResponse {
  code: string;
  data: KucoinKlineRow[];
  msg?: string;
}

/**
 *
 * @param deps
 */
export const createKucoinClient = (deps: {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  baseUrl?: string;
  httpClient?: HttpClient;
  logger?: Logger;
  time?: TimeProvider;
  uuid?: UuidProvider;
}) => {
  const {
    apiKey,
    apiSecret,
    passphrase,
    baseUrl = "https://api-futures.kucoin.com",
    httpClient = fetchHttpClient,
    logger = consoleLogger,
    time = systemTime,
    uuid = nodeUuid,
  } = deps;

  const request = async <T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    bodyObj?: any,
  ): Promise<T> => {
    const url = baseUrl + path;
    const timestamp = time().toString();
    const body = bodyObj ? JSON.stringify(bodyObj) : undefined;

    const signature = signRequest(apiSecret, method, path, body!, timestamp);

    const headers = {
      "KC-API-KEY": apiKey,
      "KC-API-SIGN": signature,
      "KC-API-TIMESTAMP": timestamp,
      "KC-API-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    //logger.info("Kucoin API request", { method, path, body });

    return httpClient(method, url, body, headers);
  };

  const getKlines = async (query: KucoinKlineQuery): Promise<KucoinKlineRow[]> => {
    const params = new URLSearchParams({
      symbol: query.symbol,
      granularity: String(query.granularity),
      from: String(query.from),
      to: String(query.to),
    });

    const path = `/api/v1/kline/query?${params.toString()}`;
    const resp = await request<KucoinKlineResponse>("GET", path);

    if (resp.code !== "200000") {
      throw new Error(`KuCoin getKlines error: ${resp.msg ?? resp.code}`);
    }

    return resp.data ?? [];
  };

  return { request, getKlines };
};

export type KucoinClient = ReturnType<typeof createKucoinClient>;
