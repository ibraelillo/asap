/// <reference path="./../../sst-env.d.ts" />

import { bus } from "sst/aws/bus";
import { createKucoinClient, createKucoinService } from "@repo/kucoin";
import { Resource } from "sst";
import {
  OrquestratorStarted,
  PositionChanged,
  PositionClosed,
} from "@repo/events";
import { BotEngine } from "@repo/bot-config";
import { event } from "sst/event";
import { normalizePrice, takeProfitPrice, securityOrder } from "./prices";

const service = createKucoinService(
  createKucoinClient({
    apiKey: Resource.Kucoin.apiKey,
    apiSecret: Resource.Kucoin.apiSecret,
    passphrase: Resource.Kucoin.passphrase,
  }),
);

const engine = new BotEngine(Resource.Bots.name, service);

/**
 * triggered on position change
 */
export const onPositionChanged = bus.subscriber(PositionChanged, async (e) => {
  const position = e.properties;

  console.log(position);

  const side = position.positionSide;
  const symbol = position.symbol;

  /*let bot;
    try {
      bot = (await repo.getBySymbol(symbol)).find(
        (bot) => bot.positionSide === side,
      );
    } catch (error) {
      console.error(`Failed to fetch bot config for ${symbol}:`, error);
      return;
    }

    if (!bot || !bot.enabled) {
      console.log(`No enabled bot found for ${symbol} ${side}`);
      return;
    }*/
  if (position.isOpen) {
    const { multiplier } = await service.market.normalize(symbol);

    await cleanActiveOrdersFor(position.symbol);

    console.log({
      symbol: position.symbol,
      multiplier,
      price: normalizePrice(position.avgEntryPrice, multiplier),
    });

    // Calculate take profit price based on position side
    // Long: entry + (entry * takeProfitPercent)
    // Short: entry - (entry * takeProfitPercent)
    const tp = takeProfitPrice(
      position.avgEntryPrice,
      position.positionSide,
      1,
      multiplier,
    );

    const so = securityOrder(
      position.avgEntryPrice,
      position.positionSide,
      1.05,
      multiplier,
    );

    console.info(`[${position.symbol}] Next security order at ${so}`);
    console.info(`[${position.symbol}] Take profit order at ${tp}`);
    console.log({ symbol, tp, so });

    const volume = 100 * 1.05;

    const [takeProfitResult, securityResult] = await Promise.allSettled([
      service.orders.addOrder({
        symbol,
        price: String(tp),
        clientOid: crypto.randomUUID(),
        marginMode: position.marginMode,
        leverage: position.leverage,
        positionSide: side,
        size: Math.abs(position.currentQty),
        closeOrder: true,
        side: side === "LONG" ? "sell" : "buy",
        type: "limit",
      }),
      service.orders.addOrder({
        symbol,
        price: String(so),
        clientOid: crypto.randomUUID(),
        marginMode: position.marginMode,
        leverage: position.leverage,
        positionSide: side,
        size: Math.abs(volume),
        side: side === "LONG" ? "buy" : "sell",
        type: "limit",
      }),
    ]);

    if (takeProfitResult.status === "rejected") {
      console.error(
        `Take profit order failed for ${symbol}:`,
        takeProfitResult.reason,
      );
    }

    if (securityResult.status === "rejected") {
      console.error(
        `Security order failed for ${symbol}:`,
        securityResult.reason,
      );
    }
  }
});

/**
 *
 * @param symbol
 */
const cleanActiveOrdersFor = async (symbol: string) => {
  console.log(`Cleaning remaining orders for ${symbol}`);

  const activeOrders = await service.orders.getActiveOrders(symbol);

  try {
    await Promise.allSettled(
      activeOrders.map(async (o) => service.orders.cancelOrder(o.id)),
    );
  } catch (e) {
    console.error(e);
  }
};

/**
 * Triggered on position closed
 */
export const onPositionClosed = bus.subscriber(PositionClosed, async (e) => {
  const position = e.properties;

  console.log(
    `Position closed for ${position.symbol}. PNL: ${position.realisedPnl} USDT`,
  );

  await cleanActiveOrdersFor(position.symbol);

  /*const bot = (await repo.getBySymbol(position.symbol)).find(
      (b) => b.positionSide === position.positionSide,
    );

    if (!bot || !bot.enabled) {
      console.log(
        `Bot not found or disabled for ${position.symbol} ${position.positionSide}`,
      );
      return;
    }*/

  const { maxLeverage } = await service.market.normalize(position.symbol);

  const valueQty =
    /*bot.equity.size ||*/ ((await service.accounts.balance()).available /
      100) *
    maxLeverage; /*bot.equity.percentage * bot.equity.maxLeverage*/

  try {
    await service.orders.addOrder({
      symbol: position.symbol,
      clientOid: crypto.randomUUID(),
      marginMode: /*bot.marginMode ||*/ "CROSS",
      leverage: /*bot.equity.maxLeverage || 10*/ maxLeverage,
      positionSide: /*bot.*/ position.positionSide,
      valueQty: "100",
      side: /*bot.*/ position.positionSide === "LONG" ? "buy" : "sell",
      type: "market",
    });

    console.log(
      `Reopened position for ${position.symbol} ${position.positionSide}`,
    );
  } catch (error) {
    console.error(`Error reopening position for ${position.symbol}:`, error);
  }
});

export const orquestratorStarted = bus.subscriber(
  OrquestratorStarted,
  async (e) => {
    console.log("Orchestrator started, initializing enabled bots");

    /*let enabledBots;
        try {
          enabledBots = await repo.getEnabled();
        } catch (error) {
          console.error("Failed to fetch enabled bots:", error);
          return;
        }

        if (!enabledBots.length) {
          console.log("No enabled bots found");
          return;
        }*/

    const results = await Promise.allSettled(
      e.properties.symbols.map(async (symbol) => {
        const pos = await service.positions.getPosition(symbol);

        for (const positionSide of ["LONG", "SHORT"]) {
          try {
            const { maxLeverage } = await service.market.normalize(
              /*bot.*/ symbol,
            );

            const p = pos.find((pos) => pos.positionSide === positionSide);

            if (!p) {
              await service.orders.addOrder({
                symbol: /*bot.*/ symbol,
                clientOid: crypto.randomUUID(),
                marginMode: /*bot.marginMode ||*/ "CROSS",
                leverage: Math.min(/*bot.leverage || 10,*/ maxLeverage),
                positionSide: /*bot.*/ positionSide,
                valueQty: String(/*bot.baseOrderSize ||*/ 100),
                side: /*bot.*/ positionSide === "LONG" ? "buy" : "sell",
                type: "market",
              });

              console.log(
                `Opened position for ${/*bot.*/ symbol} ${/*bot.*/ positionSide}`,
              );
            }
          } catch (error) {
            console.error(
              `Failed to open position for ${/*bot.*/ symbol} ${/*bot.*/ positionSide}:`,
              error,
            );
            throw error;
          }
        }
      }),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    const success = results.length - failed;
    console.log(
      `Bot initialization complete: ${success} success, ${failed} failed`,
    );
  },
);
