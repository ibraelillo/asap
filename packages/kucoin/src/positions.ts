// ---------- Position Handler ----------
import { createKucoinClient } from "./client.js";
import { ApiResult, Position } from "./types.js";
import { MarginMode } from "./schemas/order.js";

/**
 *
 * @param client
 */
export const createPositionHandler = (
  client: ReturnType<typeof createKucoinClient>,
) => {
  /**
   * Get Positions
   */
  async function getPositions(): Promise<Position[]> {
    const result = await client.request<ApiResult<Position[]>>(
      "GET",
      "/api/v1/positions",
    );

    if (result.code !== "200000") {
      throw new Error(
        `Kucoin getPositions failed: ${result.msg ?? result.code}`,
      );
    }
    return result.data;
  }

  /**
   *
   * @param symbol
   */
  async function getPosition(symbol: string): Promise<Position[]> {
    const result = await client.request<ApiResult<Position[]>>(
      "GET",
      `/api/v2/position?symbol=${symbol}`,
    );

    if (result.code !== "200000") {
      throw new Error(
        `Kucoin getPosition failed: ${result.msg ?? result.code}`,
      );
    }
    return result.data;
  }

  /**
   *
   * @param symbol
   * @param side
   * @param timeout
   * @param retry
   */
  async function waitUntilPositionOpen(
    symbol: string,
    side: "long" | "short",
    timeout = 2000,
    retry = 4,
  ) {
    const checks = Math.max(1, retry);
    const waitMs = Math.max(100, Math.ceil(timeout / checks));

    for (let attempt = 0; attempt < checks; attempt++) {
      const pos = (await getPosition(symbol)).find(
        (pos) => pos?.positionSide === side.toUpperCase(),
      );

      const qty = Math.abs(Number(pos?.currentQty ?? 0));
      if (pos?.isOpen && Number.isFinite(qty) && qty > 0) {
        return pos;
      }

      if (attempt < checks - 1) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    return undefined;
  }

  /**
   *
   * @param symbol
   * @param marginMode
   */
  async function switchMarginMode(symbol: string, marginMode: MarginMode) {
    const resp = await client.request<
      ApiResult<{
        /**
         * Margin mode: ISOLATED (isolated), CROSS (cross margin).
         */
        marginMode: MarginMode;
        /**
         * Symbol of the contract, Please refer to [Get Symbol endpoint:
         * symbol](/docs-new/rest/futures-trading/market-data/get-all-symbols)
         */
        symbol: string;
      }>
    >("POST", "/api/v2/position/changeMarginMode", {
      symbol,
      marginMode,
    });

    if (resp.code !== "200000") {
      throw new Error(`KuCoin switchMarginMode error: code=${resp.code}`);
    }
    return resp.data;
  }

  /**
   *
   * @param symbol
   */
  async function getMarginMode(symbol: string) {
    const resp = await client.request<
      ApiResult<{
        /**
         * Margin mode: ISOLATED (isolated), CROSS (cross margin).
         */
        marginMode: MarginMode;
        /**
         * Symbol of the contract, Please refer to [Get Symbol endpoint:
         * symbol](/docs-new/rest/futures-trading/market-data/get-all-symbols)
         */
        symbol: string;
      }>
    >("GET", `/api/v2/position/getMarginMode?symbol=${symbol}`);

    if (resp.code !== "200000") {
      throw new Error(`KuCoin getAllSymbols error: code=${resp.code}`);
    }
    return resp.data;
  }

  async function changeLeverage(symbol: string, leverage: number) {
    const resp = await client.request<ApiResult<boolean>>(
      "POST",
      "/api/v2/changeCrossUserLeverage",
      {
        symbol,
        leverage: String(leverage),
      },
    );

    if (resp.code !== "200000") {
      throw new Error(`KuCoin changeLeverage error: code=${resp.code}`);
    }
    return resp.data;
  }

  return {
    /**
     *
     */
    getPositions,

    /**
     *
     * @param symbol
     */
    getPosition,

    /**
     *
     */
    waitUntilPositionOpen,

    /**
     *
     */
    switchMarginMode,

    /**
     *
     */
    getMarginMode,

    /**
     *
     */
    changeLeverage,
  };
};
