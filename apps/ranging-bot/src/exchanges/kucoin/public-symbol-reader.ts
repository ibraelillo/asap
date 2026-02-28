import type {
  ExchangeSymbolReader,
  ExchangeSymbolSummary,
} from "@repo/trading-engine";
import { getRuntimeSettings } from "../../runtime-settings";

interface KucoinContractsResponse {
  code: string;
  data?: Array<{
    symbol: string;
    baseCurrency?: string;
    quoteCurrency?: string;
    status?: string;
    maxLeverage?: number;
    supportCross?: boolean;
    type?: string;
    settleCurrency?: string;
  }>;
  msg?: string;
}

export class KucoinPublicSymbolReader implements ExchangeSymbolReader {
  async listSymbols(): Promise<ExchangeSymbolSummary[]> {
    const runtimeSettings = getRuntimeSettings();
    const response = await fetch(
      `${runtimeSettings.kucoinPublicBaseUrl}/api/v1/contracts/active`,
    );

    if (!response.ok) {
      throw new Error(
        `KuCoin public symbol request failed (${response.status})`,
      );
    }

    const payload = (await response.json()) as KucoinContractsResponse;
    if (payload.code !== "200000") {
      throw new Error(
        `KuCoin public symbol request returned ${payload.msg ?? payload.code}`,
      );
    }

    return (payload.data ?? [])
      .map((symbol) => ({
        symbol: symbol.symbol,
        baseCurrency: symbol.baseCurrency,
        quoteCurrency: symbol.quoteCurrency,
        status: symbol.status,
        maxLeverage: symbol.maxLeverage,
        supportCross: symbol.supportCross,
        raw: {
          type: symbol.type,
          settleCurrency: symbol.settleCurrency,
        },
      }))
      .sort((left, right) => left.symbol.localeCompare(right.symbol));
  }
}
