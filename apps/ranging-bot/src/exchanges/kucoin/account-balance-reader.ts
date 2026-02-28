import type {
  ExchangeAccountBalanceReader,
  ExchangeAccountBalanceSnapshot,
} from "@repo/trading-engine";
import type { KucoinService } from "@repo/kucoin";

export class KucoinAccountBalanceReader
  implements ExchangeAccountBalanceReader
{
  constructor(private readonly service: KucoinService) {}

  async getBalance(currency = "USDT"): Promise<ExchangeAccountBalanceSnapshot> {
    const balance = await this.service.accounts.balance(currency);
    return {
      currency,
      available: balance.available,
      total: balance.total,
    };
  }
}
