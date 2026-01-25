// ---------- Account Handler ----------
import { createKucoinClient } from "./client";
import { AccountBalance, ApiResult } from "./types.js";

export const createAccountHandler = (
  client: ReturnType<typeof createKucoinClient>,
) => ({
  /**
   *
   */
  async getAccounts(): Promise<AccountBalance[]> {
    const result = await client.request<ApiResult<AccountBalance[]>>(
      "GET",
      "/api/v1/account-overview",
    );

    if (result.code !== "200000") {
      throw new Error(
        `Kucoin getAccounts failed: ${result.msg ?? result.code}`,
      );
    }
    return Array.isArray(result.data) ? result.data : [result.data];
  },

  /**
   *
   * @param currency
   */
  async getAccount(currency: string): Promise<AccountBalance> {
    const result = await client.request<ApiResult<AccountBalance>>(
      "GET",
      `/api/v1/account-overview?currency=${currency}`,
    );

    if (result.code !== "200000") {
      throw new Error(`Kucoin getAccount failed: ${result.msg ?? result.code}`);
    }
    return result.data;
  },

  /**
   *
   * @param currency
   */
  async balance(currency = "USDT") {
    const result = await client.request<ApiResult<AccountBalance>>(
      "GET",
      `/api/v1/account-overview?currency=${currency || "USDT"}`,
    );

    if (result.code !== "200000") {
      throw new Error(`Kucoin getAccount failed: ${result.msg ?? result.code}`);
    }

    const { availableBalance, accountEquity } = result.data;

    return {
      available: availableBalance,
      total: accountEquity,
    };
  },
});
