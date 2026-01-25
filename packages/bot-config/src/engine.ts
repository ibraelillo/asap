// bot-engine.ts
import { KucoinService, Position } from "@repo/kucoin";
import { type Bot, createBot } from "./bot";
import { Repo } from "./repo";

export class BotEngine {
    private repo: Repo;

    private bots = new Map<string, Bot>();

    /**
     * Creates an instance of the class with the specified parameters.
     *
     * @param {string} table - The name of the table to be used.
     * @param {KucoinService} service - The service instance to be utilized.
     */
    constructor(
        table: string,
        private readonly service: KucoinService
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
    async createBot(symbol: string, side: 'LONG' | 'SHORT') {
        const botId = `${symbol}-${side}`;

        const bot = createBot(symbol, side, this.service)

        this.bots.set(botId, bot);
    }

    async start() {
        const bots = this.bots.entries()

        for await (const key of this.bots.keys()) {
            try {
                await this.bots.get(key).start()

                console.info('key', 'ok')
            }catch(e) {

            }
        }
    }

    /**
     * Retrieves a bot instance based on the specified symbol and trading side.
     *
     * @param {string} symbol - The unique identifier for the trading pair or asset.
     * @param {'LONG'|'SHORT'} side - The trading side, either 'LONG' or 'SHORT'.
     * @return {Object|undefined} The bot instance associated with the given symbol and side, or undefined if not found.
     */
    getBot(symbol: string, side: 'LONG' | 'SHORT') {
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
            await bot.positionChanged(position);
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
            await bot?.positionClosed(position);
        }
    }
}
