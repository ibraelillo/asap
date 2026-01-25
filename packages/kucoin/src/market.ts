import { createKucoinClient } from "./client";
import { SharedFetcher } from "./fetcher";

export interface SymbolInfo {
  symbol: string;
  rootSymbol: string;
  type: string;
  firstOpenDate: number;
  expireDate: number | null;
  settleDate: number | null;
  baseCurrency: string;
  quoteCurrency: string;
  settleCurrency: string;
  maxOrderQty: number;
  maxPrice: number;
  lotSize: number;
  tickSize: number;
  indexPriceTickSize: number;
  multiplier: number;
  initialMargin: number;
  maintainMargin: number;
  maxRiskLimit: number;
  minRiskLimit: number;
  riskStep: number;
  makerFeeRate: number;
  takerFeeRate: number;
  takerFixFee: number;
  makerFixFee: number;
  settlementFee: number | null;
  isDeleverage: boolean;
  isQuanto: boolean;
  isInverse: boolean;
  markMethod: string;
  fairMethod: string;
  fundingBaseSymbol: string;
  fundingQuoteSymbol: string;
  fundingRateSymbol: string;
  indexSymbol: string;
  settlementSymbol: string;
  status: string;
  fundingFeeRate: number;
  predictedFundingFeeRate: number;
  fundingRateGranularity: number;
  openInterest: string;
  turnoverOf24h: number;
  volumeOf24h: number;
  markPrice: number;
  indexPrice: number;
  lastTradePrice: number;
  nextFundingRateTime: number;
  maxLeverage: number;
  sourceExchanges: string[];
  premiumsSymbol1M: string;
  premiumsSymbol8H: string;
  fundingBaseSymbol1M: string;
  fundingQuoteSymbol1M: string;
  lowPrice: number;
  highPrice: number;
  priceChgPct: number;
  priceChg: number;
  k: number;
  m: number;
  f: number;
  mmrLimit: number;
  mmrLevConstant: number;
  supportCross: boolean;
  buyLimit: number;
  sellLimit: number;
}

export interface GetSymbolsListResponse {
  code: string;
  data: SymbolInfo[];
}

// Assuming dependencies: HttpClient etc. from earlier module

const ALLOWED_PREFIXES = ["", "1000", "10000", "100000", "1000000"];

/**
 *
 * @param client
 */
export function createMarketDataHandler(
  client: ReturnType<typeof createKucoinClient>,
) {
  /**
   *
   */
  async function getAllSymbols(): Promise<SymbolInfo[]> {
    const resp = await client.request<GetSymbolsListResponse>(
      "GET",
      "/api/v1/contracts/active",
    );

    if (resp.code !== "200000") {
      throw new Error(`KuCoin getAllSymbols error: code=${resp.code}`);
    }
    return resp.data;
  }

  const symbolsFetcher = new SharedFetcher(getAllSymbols, true);

  /**
   *
   * @param symbol
   */
  async function normalize(symbol: string) {
    const str = symbol.toUpperCase();

    // 1. Remove optional suffix (.M, .P, etc.) in input
    const strippedInput = str.replace(/[.][A-Z]+$/, "");

    // 2. Extract base symbol (remove leading digits)
    const baseMatch = strippedInput.match(/^\d*(?<sym>[A-Z0-9]+)$/);
    if (!baseMatch?.groups?.sym) return undefined;

    const baseSymbol = baseMatch.groups.sym;

    console.info(`Using "${baseSymbol}" as base to find ticker`);

    const data = await symbolsFetcher.get({ symbol });

    // 3. Match against dataset symbols ending with M
    const found = data.find((s) => {
      // dataset core = remove final M
      const datasetSymbol = s.symbol.endsWith("M")
        ? s.symbol.slice(0, -1)
        : s.symbol;

      return ALLOWED_PREFIXES.some(
        (prefix) =>
          datasetSymbol ===
          `${prefix}${baseSymbol.endsWith("M") ? baseSymbol.slice(0, -1) : baseSymbol}`,
      );
    });

    if (!found) return undefined;

    console.info(
      `Found ${found.symbol} equivalent for ${symbol} `,
      JSON.stringify({
        symbol: found.symbol,
        maxLeverage: found.maxLeverage,
        supportCross: found.supportCross,
      }),
    );

    if (found.maxLeverage < 12) {
      console.info(
        `Very low leverage for ${found.symbol}: ${found.maxLeverage}. Abort.`,
        JSON.stringify({
          symbol: found.symbol,
          maxLeverage: found.maxLeverage,
        }),
      );

      return undefined;
    }

    return found;
  }

  return {
    getAllSymbols,
    normalize,
  };
}
