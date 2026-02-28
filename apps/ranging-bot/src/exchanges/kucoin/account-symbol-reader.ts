import type {
  ExchangeSymbolReader,
  ExchangeSymbolSummary,
} from "@repo/trading-engine";
import type { KucoinService } from "@repo/kucoin";

export class KucoinAccountSymbolReader implements ExchangeSymbolReader {
  constructor(private readonly service: KucoinService) {}

  async listSymbols(): Promise<ExchangeSymbolSummary[]> {
    const symbols = await this.service.market.getAllSymbols();

    return symbols
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
