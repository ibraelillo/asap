// ---------- Service Composition ----------
import { createOrderHandler } from "./orders.js";
import { createKucoinClient } from "./client.js";
import { createPositionHandler } from "./positions.js";
import { createAccountHandler } from "./account.js";
import { createMarketDataHandler } from "./market.js";
import { createUtils } from "./utils.js";

export * from "./client.js";
export * from "./types.js";

/**
 *
 * @param client
 */
export const createKucoinService = (
  client: ReturnType<typeof createKucoinClient>,
) => ({
  /**
   *
   */
  orders: createOrderHandler(client),
  /**
   *
   */
  positions: createPositionHandler(client),
  /**
   *
   */
  accounts: createAccountHandler(client),
  /**
   *
   */
  market: createMarketDataHandler(client),
  /**
   *
   */
  utils: createUtils(),
});

export type KucoinService = ReturnType<typeof createKucoinService>;
