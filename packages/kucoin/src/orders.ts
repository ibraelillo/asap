// ---------- Behaviors ----------
import { AddOrderResponse, ApiResult, Order } from "./types.js";
import { createKucoinClient } from "./client";
import {
  AddOrderParams,
  AddTPSLOrderParams,
  schema,
  slTpSchema,
} from "./schemas/order";

export const createOrderHandler = (
  client: ReturnType<typeof createKucoinClient>,
) => ({
  /**
   *
   * @param params
   */
  async addOrder(params: AddOrderParams): Promise<AddOrderResponse> {
    const body = schema.parse(params);

    const result = await client.request<ApiResult<AddOrderResponse>>(
      "POST",
      "/api/v1/orders",
      body,
    );

    if (result.code !== "200000") {
      throw new Error(`Kucoin addOrder failed: ${result.msg ?? result.code}`);
    }
    return result.data;
  },

  /**
   *
   * @param params
   */
  async addTPSLOrder(params: AddTPSLOrderParams): Promise<AddOrderResponse> {
    const body = slTpSchema.parse({
      ...params,
      clientOid: params.clientOid,
    });
    console.log(params.clientOid, params.symbol);

    const result = await client.request<ApiResult<AddOrderResponse>>(
      "POST",
      "/api/v1/st-orders",
      body,
    );

    if (result.code !== "200000") {
      throw new Error(`Kucoin addOrder failed: ${result.msg ?? result.code}`);
    }
    return result.data;
  },

  async addBatchOrders(orders: (AddOrderParams | AddTPSLOrderParams)[]) {
    const body = orders.map((o) =>
      slTpSchema.parse({
        ...o,
        clientOid: o.clientOid,
      }),
    );

    const result = await client.request<
      ApiResult<(AddOrderResponse & { symbol: string })[]>
    >("GET", "/api/v1/orders/multi", body);

    if (result.code !== "200000") {
      throw new Error(`Kucoin addOrder failed: ${result.msg ?? result.code}`);
    }
    return result.data;
  },

  async getActiveOrders(symbol: string, side?: "buy" | "sell") {
    const result = await client.request<ApiResult<{ items: Order[] }>>(
      "GET",
      `/api/v1/orders?symbol=${symbol}&status=active${side ? `&side=${side}` : ""}`,
    );

    if (result.code !== "200000") {
      throw new Error(`Kucoin addOrder failed: ${result.msg ?? result.code}`);
    }
    return result.data.items || [];
  },

  async getStopOrders(symbol: string, side: "buy" | "sell") {
    console.log(
      `/api/v1/stopOrders?symbol=${symbol}&status=active&side=${side}`,
    );

    const result = await client.request<ApiResult<{ items: Order[] }>>(
      "GET",
      `/api/v1/stopOrders?symbol=${symbol}&status=active&side=${side}`,
    );

    if (result.code !== "200000") {
      throw new Error(`Kucoin addOrder failed: ${result.msg ?? result.code}`);
    }
    return result.data.items || [];
  },

  /**
   *
   * @param orderId
   */
  async cancelOrder(orderId: string): Promise<{ cancelledOrderIds: string[] }> {
    const result = await client.request<
      ApiResult<{ cancelledOrderIds: string[] }>
    >("DELETE", `/api/v1/orders/${orderId}`);

    if (result.code !== "200000") {
      throw new Error(
        `Kucoin cancelOrder failed: ${result.msg ?? result.code}`,
      );
    }
    return result.data;
  },

  /**
   * Cancel all orders for a symbol
   */
  async cancelAllOrders(
    symbol: string,
  ): Promise<{ cancelledOrderIds: string[] }> {
    const result = await client.request<
      ApiResult<{ cancelledOrderIds: string[] }>
    >("DELETE", `/api/v1/orders?symbol=${symbol}`);

    if (result.code !== "200000") {
      throw new Error(
        `Kucoin cancelAllOrders failed: ${result.msg ?? result.code}`,
      );
    }
    return result.data;
  },
});
