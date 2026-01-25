import { hc, type ClientRequestOptions, parseResponse } from "hono/client";
import type { AppType } from "@repo/bots/api";
import type { BotConfigCreate, BotConfig } from '@repo/bot-config'

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

class ApiClient {
  private client: ReturnType<typeof hc<AppType>>;

  constructor(
    private readonly url: string = API_URL,
    private readonly options?: ClientRequestOptions = {},
  ) {
    this.client = hc<AppType>(url, options);
  }

  /**
   *
   */
  async getBots() {
    return parseResponse(this.client.bots.$get());
  }

  /**
   *
   * @param id
   */
  async getBot(id: string) {
    return await parseResponse(
      this.client.bots[":id"].$get({
        param: { id },
      }),
    );
  }

  /**
   *
   * @param bot
   */
  async createBot(bot: BotConfigCreate) {
    return await parseResponse(
      this.client.bots.$post({
        json: bot,
      }),
    );
  }

  /**
   *
   * @param id
   * @param bot
   */
  async updateBot(id: string, bot: Partial<BotConfig>) {
    return await parseResponse(
      this.client.bots[":id"].$put({
        param: { id },
        json: bot,
      }),
    );
  }

  /**
   *
   * @param id
   */
  async toggleBot(id: string) {
    return await parseResponse(
      this.client.bots[":id"].toggle.$patch({
        param: { id },
      }),
    );
  }

  /**
   *
   * @param id
   */
  async deleteBot(id: string) {
    return parseResponse(
      this.client.bots[":id"].$delete({
        param: { id },
      }),
    );
  }
}

export const api = new ApiClient(API_URL, {
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
});
