import type {
  ExchangeAccountBalanceReader,
  ExchangeAccountBalanceSnapshot,
} from "@repo/trading-engine";
import type { AccountBalance, KucoinService } from "@repo/kucoin";

export class KucoinAccountBalanceReader
  implements ExchangeAccountBalanceReader
{
  constructor(private readonly service: KucoinService) {}

  async getBalance(currency = "USDT"): Promise<ExchangeAccountBalanceSnapshot> {
    const accounts = await this.service.accounts.getAccounts();
    const exactMatch = accounts.find(
      (account) => account.currency.toUpperCase() === currency.toUpperCase(),
    );
    const selected =
      exactMatch ??
      this.selectPrimaryBalance(accounts) ??
      (await this.service.accounts.getAccount(currency));

    return {
      currency: selected.currency,
      available: Number(selected.availableBalance),
      total: Number(selected.accountEquity),
      raw: selected,
    };
  }

  private selectPrimaryBalance(
    accounts: AccountBalance[],
  ): AccountBalance | undefined {
    return [...accounts].sort((left, right) => {
      const totalDelta =
        Number(right.accountEquity) - Number(left.accountEquity);
      if (Math.abs(totalDelta) > Number.EPSILON) {
        return totalDelta;
      }

      return Number(right.availableBalance) - Number(left.availableBalance);
    })[0];
  }
}
