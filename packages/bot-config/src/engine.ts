// bot-engine.ts
import { KucoinService, Position } from "@repo/kucoin";
import { type Bot, createBot } from "./bot";
import { Repo } from "./repo";

export class BotEngine {
  private repo: Repo;

  private bots = new Map<string, Bot>();
  private readonly enginePrefix = "[ENGINE]";
  private readonly now = () => new Date().toISOString();
  private log(event: string, details?: Record<string, unknown>) {
    if (details) {
      console.log(`${this.now()} ${this.enginePrefix} ${event}`, details);
      return;
    }

    console.log(`${this.now()} ${this.enginePrefix} ${event}`);
  }
  private warn(event: string, details?: Record<string, unknown>) {
    if (details) {
      console.warn(`${this.now()} ${this.enginePrefix} ${event}`, details);
      return;
    }

    console.warn(`${this.now()} ${this.enginePrefix} ${event}`);
  }
  private err(
    event: string,
    error: unknown,
    details?: Record<string, unknown>,
  ) {
    if (details) {
      console.error(
        `${this.now()} ${this.enginePrefix} ${event}`,
        details,
        error,
      );
      return;
    }

    console.error(`${this.now()} ${this.enginePrefix} ${event}`, error);
  }

  /**
   * Creates an instance of the class with the specified parameters.
   *
   * @param {string} table - The name of the table to be used.
   * @param {KucoinService} service - The service instance to be utilized.
   */
  constructor(
    table: string,
    private readonly service: KucoinService,
  ) {
    //this.repo = createRepo(table);
  }

  /**
   * Creates and initializes a bot based on the provided symbol and side.
   *
   * @param {string} symbol - The trading pair symbol for the bot.
   * @param {'LONG' | 'SHORT'} side - The side of the position for the bot, either 'LONG' or 'SHORT'.
   * @return {void} This method does not return a value.
   */
  async createBot(symbol: string, side: "LONG" | "SHORT") {
    const botId = `${symbol}-${side}`;

    const bot = createBot(symbol, side, this.service);

    this.bots.set(botId, bot);
    this.log("Bot registered", { botId, totalBots: this.bots.size });
  }

  async start() {
    this.log("Starting engine", { bots: this.bots.size });

    for await (const key of this.bots.keys()) {
      try {
        await this.bots.get(key).start();
        this.log("Bot started", { botId: key });
      } catch (e) {
        this.err("Bot failed to start", e, { botId: key });
      }
    }

    this.log("Engine start completed");
  }

  /**
   * Retrieves a bot instance based on the specified symbol and trading side.
   *
   * @param {string} symbol - The unique identifier for the trading pair or asset.
   * @param {'LONG'|'SHORT'} side - The trading side, either 'LONG' or 'SHORT'.
   * @return {Object|undefined} The bot instance associated with the given symbol and side, or undefined if not found.
   */
  getBot(symbol: string, side: "LONG" | "SHORT") {
    const botId = `${symbol}-${side}`;

    return this.bots.get(botId)!;
  }

  /**
   * Handles changes to the position and updates the respective bot.
   *
   * @param {Position} position - The position object containing details of the updated position.
   * @return {Promise<void>} A promise that resolves when the position change has been processed.
   */
  async onPositionChanged(position: Position) {
    delete position.commonResponse;

    const bot = this.getBot(position.symbol, position.positionSide);

    if (bot) {
      this.log("Routing position change", {
        symbol: position.symbol,
        side: position.positionSide,
        qty: Number(position.currentQty ?? 0),
        avgEntry: Number(position.avgEntryPrice ?? 0),
        isOpen: Boolean(position.isOpen),
      });
      await bot.positionChanged(position);
    } else {
      this.warn("Position change dropped because bot was not found", {
        symbol: position.symbol,
        side: position.positionSide,
      });
    }
  }

  /**
   * Handles changes to the position and updates the respective bot.
   *
   * @param {Position} position - The position object containing details of the updated position.
   * @return {Promise<void>} A promise that resolves when the position change has been processed.
   */
  async onPositionClosed(position: Position) {
    delete position.commonResponse;

    const bot = this.getBot(position.symbol, position.positionSide);

    if (bot) {
      this.log("Routing position close", {
        symbol: position.symbol,
        side: position.positionSide,
        realisedPnl: Number(position.realisedPnl ?? 0),
      });
      await bot?.positionClosed(position);
    } else {
      this.warn("Position close dropped because bot was not found", {
        symbol: position.symbol,
        side: position.positionSide,
      });
    }
  }
}
