import { KucoinService, type Position } from "@repo/kucoin";
import { DcaConfigManager } from "./dca";
import { normalizePrice } from "./prices";

export type Bot = ReturnType<typeof createBot>;


const cfgMgr = new DcaConfigManager();

/**
 *
 * @param symbol
 * @param side
 * @param service
 */
export const createBot = (
    symbol: string,
    side: Position["positionSide"],
    service: KucoinService
) => {

    const orders = new Map<string, string>();
    let dcaQueue: Array<{ price: string; size: string; index: number }> = [];

    const cfg = cfgMgr.get(symbol);

    let dcaCount = 0;
    let lastAvgEntry = 0;
    let lastSize = 0;
    let activeDcaOrderId: string | null = null;


    const sym = service.market.normalize(symbol)

    const isActiveDcaOrderStillOpen = async (): Promise<boolean> => {
        if (!activeDcaOrderId) return false;
      
        const active = await service.orders.getActiveOrders(symbol);
        return active.some(
          (o) => o.id === activeDcaOrderId && o.positionSide === side
        );
      };
      

    const hasEnoughMargin = async () => {
        const {maxLeverage: leverage} = await sym;
        
        const maxSteps = cfg.maxDcas ?? cfg.steps.length;
        
        const totalRequired = cfg.base * (1 + cfg.steps.slice(0, maxSteps).reduce((sum, s) => sum + s.sizeMult, 0));
        const marginRequired = totalRequired / leverage * 1.3;
        
        const {available: availableBalance } = await service.accounts.balance();
        
        if (availableBalance < marginRequired) {
            console.log(`${symbol}: Insufficient margin. Need ${marginRequired.toFixed(2)} USDT, have ${availableBalance.toFixed(2)} USDT`);
            return false;
        }
        
        console.log(`${symbol}: Margin OK. Need ${marginRequired.toFixed(2)} USDT, have ${availableBalance.toFixed(2)} USDT`);
        return true;
    }

    const fillQueue = async (pos: Position) => {
        const {tickSize } = await sym;
        
        const maxSteps = cfg.maxDcas ?? cfg.steps.length;
        const avg = Number(pos.avgEntryPrice);
        const direction = side === "LONG" ? -1 : 1; // LONG: buy lower, SHORT: sell higher

        for (let i = 0; i < maxSteps; i++) {
            const step = cfg.steps[i];
            const dist = step.distancePct / 100;

            const dcaPrice = normalizePrice(
                avg * (1 + direction * dist),
                tickSize
            );

            const orderSize = cfg.base * step.sizeMult;
            dcaQueue.push({
                price: dcaPrice.toString(),
                size: orderSize.toString(),
                index: i,
            });
        }
        console.log(`${symbol}: Queue filled with ${dcaQueue.length} orders`);
    }

    const addNextSecurityOrder = async () => {
        if (dcaQueue.length === 0) {
            console.log(`${symbol}: No more DCA steps left.`);
            return;
          }
        
          // Don't place a new SO if one is already working
          if (activeDcaOrderId) {
            console.log(`${symbol}: Security order already active (${activeDcaOrderId}), skipping.`);
            return;
          }
        
          try {
            const { maxLeverage: leverage } = await sym;
            const order = dcaQueue.shift()!;
        
            if (order) {
              console.log(
                `${symbol}: SO #${order.index + 1} at ${order.price} for ${order.size} USDT. (${dcaQueue.length} orders left)`
              );
        
              const { orderId } = await service.orders.addOrder({
                symbol,
                positionSide: side,
                valueQty: order.size,
                side: side === "LONG" ? "buy" : "sell",
                leverage,
                type: "limit",
                price: String(order.price),
                clientOid: crypto.randomUUID(),
                marginMode: "CROSS",
              });
        
              dcaCount++;
              activeDcaOrderId = orderId;
              orders.set(`so_${order.index}`, orderId);
            }
          } catch (error) {
            console.error(`${symbol}: Failed to place SO:`, error);
          } 
        };



    /**
     * Asynchronously adds an initial order for a specific trading symbol.
     *
     * This function retrieves necessary configuration details, including tick size and maximum leverage,
     * to prepare and execute an initial order in the trading system. It determines the order's position,
     * value, and other specifications based on the given context and state.
     *
     * @function
     * @returns {Promise<Object>} A promise that resolves with the result of adding the order.
     *
     * @throws {Error} If there are issues retrieving configuration data or executing the order.
     */
    const addInitialOrder = async () => {
        try {
            const {tickSize, maxLeverage: leverage} = await sym

            const {base} = cfgMgr.get(symbol);

            console.log(`${symbol}:  Initial order. ${base} USDT`)

            return await service.orders.addOrder({
                symbol: symbol,
                positionSide: side,
                valueQty: base.toString(),
                side: side === "LONG" ? "buy" : "sell",
                leverage: leverage,
                type: "market",
                clientOid: crypto.randomUUID(),
                marginMode: "CROSS",
            });
        } catch (error) {
            console.error(`${symbol}: Failed to add initial order for ${side} position:`, error, " \n\n");
            throw error;
        }
    }

    /**
     * Asynchronously clears all pending orders for the current symbol.
     *
     * This function fetches all active orders associated with the current symbol
     * and attempts to cancel each order. The cancellations are performed concurrently
     * using `Promise.allSettled` to ensure all cancellation attempts are made, regardless
     * of individual failures.
     *
     * Dependencies:
     * - `service.orders.getActiveOrders`: Retrieves active orders for the specified symbol.
     * - `service.orders.cancelOrder`: Cancels an order based on its `orderId`.
     * - `getState`: Provides the current application state, which is used to retrieve the symbol.
     */
    const clearPendingOrders = async () => {
        try {
            const ordersList = await service.orders.getActiveOrders(symbol);
            const filtered = ordersList.filter((o) => o.positionSide === side);
        
            console.log(`${symbol}: Clearing pending orders. ${filtered.length} remaining.`);
        
            filtered.forEach((o) => console.log(o.symbol, o.positionSide));
        
            await Promise.allSettled(
              filtered.map(async ({ id }) => {
                try {
                  console.log(`${symbol}: Removing order with id: ${id}\n\n`);
                  await service.orders.cancelOrder(id);
                } catch (e) {
                  console.error(`${symbol}: Failed to cancel order ${id}:`, e);
                }
              })
            );
        
            // reset local SO/TP state
            activeDcaOrderId = null;
            dcaQueue = [];
            dcaCount = 0;
            orders.clear();
        } catch (error) {
            console.error(`${symbol}: Failed to clear pending orders for ${side} position:`, error);
        }
    }


    /**
     * Sets a take profit order for a given position.
     *
     * @async
     * @param {Position} pos - The position object which contains details about the current trading position.
     * @returns {Promise<Object|undefined>} A promise that resolves to the take profit order object if successful, or undefined if the position is invalid.
     *
     * This function calculates the break-even price based on the average entry price, current fees, and other position details.
     * It then determines a take profit price using the configured take profit percentage.
     * A limit order is created at this price to close the position once the profit target is reached.
     *
     * The take profit price is normalized to adhere to the tick size of the given symbol's configuration.
     *
     * Logs are generated for debugging purposes, indicating the take profit price being set.
     *
     * Throws errors if any issues occur during the retrieval of symbol configuration, normalization process, or order placement.
     */
    const addTakeProfit = async (pos: Position) => {
        if (!pos || !pos.isOpen) return undefined;

        const avg = Number(pos.avgEntryPrice);
        const size = Math.abs(Number(pos.currentQty));

        if(lastAvgEntry !== avg) {

            try {
                if (orders.get("tp")) {
                    try {
                      const existingId = orders.get("tp")!;
                      const { cancelledOrderIds } = await service.orders.cancelOrder(existingId);
                      if (cancelledOrderIds.includes(existingId)) {
                        orders.delete("tp");
                      }
                    } catch (e) {
                      // ignore TP cancel errors
                    }
                }

                
                const { tickSize, maxLeverage } = await sym;

                if (!size || !isFinite(size)) {
                    throw new Error(`Invalid position size: ${pos.currentQty}`);
                }

                const comm = Number(pos.currentComm ?? 0.15);
                const funding = Number(pos.posFunding ?? 0.15);

                const totalFees = comm + funding; // signed (negative = cost, positive = rebate)
                const dir = side === "LONG" ? 1 : -1;

                // Break-even price including fees:
                // PnL = (price - avg) * size + totalFees
                // PnL = 0  =>  BE = avg - totalFees / size
                const breakEven = avg - totalFees / size * dir;

                const tpPct = (cfg.takeProfitPct ?? 0.25) / 100;

                let rawTp: number;
                if (side === "LONG") {
                    rawTp = breakEven * (1 + tpPct);
                } else {
                    rawTp = breakEven * (1 - tpPct);
                }

                const tpPrice = normalizePrice(rawTp, tickSize);

                console.log(`${symbol}: TP at ${tpPrice} \n\n`);

                const {orderId} = await service.orders.addOrder({
                    symbol: symbol,
                    positionSide: side,
                    side: side === "LONG" ? "sell" : "buy",
                    leverage: maxLeverage,
                    type: "limit",
                    reduceOnly: true,
                    closeOrder: true,
                    price: tpPrice?.toString(),
                    clientOid: crypto.randomUUID(),
                    marginMode: "CROSS",
                });

                orders.set('tp', orderId);
                lastAvgEntry = avg;
                lastSize = size
            } catch (error) {
                console.error(`${symbol}: Failed to add take profit order for ${side} position at entry ${pos.avgEntryPrice}:`, error);
            }
        }
    }

    /**
     * Initiates the starting process for a given symbol and executes subsequent actions
     * based on the identification of an existing position related to a specific side.
     *
     * This asynchronous function logs a starting message for the specified symbol,
     * retrieves the current positions of the symbol, and determines if there is an
     * existing position with the same side. If such a position exists, it triggers a
     * follow-up handler; otherwise, it initiates an order-adding process.
     *
     * @function start
     * @async
     */
    const start = async () => {
        try {
            console.log(`${symbol}: Starting...`);
            await sym;
        
            const positions = await service.positions.getPosition(symbol);
            const pos = positions.find((p) => p.positionSide === side);
        
            if (pos) {
              console.log(`${symbol}: Position found. Open price at: ${pos.avgEntryPrice}`);
        
              lastSize = Math.abs(Number(pos.currentQty));
              //lastAvgEntry = Number(pos.avgEntryPrice);
        
              await clearPendingOrders();
        
              await fillQueue(pos);
              await addTakeProfit(pos);
              await addNextSecurityOrder(); // no arg
            } else {
              if (!(await hasEnoughMargin())) return;
        
              await clearPendingOrders();
              await addInitialOrder();
            }
        } catch (error) {
            console.error(`${symbol}: Failed to start bot for ${side} position:`, error);
            throw error;
        }
    };

    const stop = async () => {
    };

    /**
     * This asynchronous function handles updates to a trading position's attributes.
     * It first clears any pending orders associated with the trade,
     * then recalculates the take profit value for the position and dispatches the
     * updated value. Additionally, it adds necessary security orders for the
     * provided position.
     *
     * @param {Position} pos - The trading position object containing necessary
     * details about the trade configuration to be updated.
     * @returns {Promise<void>} A promise that resolves once all actions are completed.
     */
     const positionChanged = async (pos: Position) => {
        try {
          const size = Math.abs(Number(pos.currentQty));
          const avg = Number(pos.avgEntryPrice);
      
          if (!size || !isFinite(size)) {
            console.log(`${symbol}: positionChanged with invalid size, skipping`);
            return;
          }
      
          // First time we see this position
          if (lastSize === 0) {
            console.log(`${symbol}: positionChanged init: size=${size}, avg=${avg}`);
      
            if (dcaQueue.length === 0 && dcaCount === 0) {
              await fillQueue(pos);
            }
      
            await addTakeProfit(pos);
      
            if (!activeDcaOrderId) {
              await addNextSecurityOrder();
            }
      
            return;
          }
      
          // 🔍 Check if current DCA order is still active on the exchange
          if (activeDcaOrderId) {
            const stillOpen = await isActiveDcaOrderStillOpen();
      
            if (!stillOpen) {
              console.log(
                `${symbol}: DCA order ${activeDcaOrderId} no longer active. Assuming filled, placing next.`
              );
      
              // That SO is now considered consumed
              activeDcaOrderId = null;
      
              await addTakeProfit(pos);   // update TP to new BE
              await addNextSecurityOrder(); // place next DCA, if any
            } else {
              // Order still active: this may be just a partial fill or price move.
              console.log(
                `${symbol}: DCA order ${activeDcaOrderId} still active. No new SO placed. size=${size}, lastSize=${lastSize}`
              );
            }
          } else {
            // No active DCA order, but position changed (manual intervention, or restart)
            if (size > lastSize) {
              console.log(
                `${symbol}: Position size increased ${lastSize} -> ${size} with no active DCA order. Placing next one.`
              );
              await addTakeProfit(pos);
              await addNextSecurityOrder();
            }
          }
      
          // Always update these at the end
          lastSize = size;
          lastAvgEntry = avg;
        } catch (error) {
          console.error(
            `${symbol}: Failed to handle position change for ${side} at ${pos.avgEntryPrice}:`,
            error
          );
        }
      };
      

    /**
     * An asynchronous function that resets the trading position and clears any pending orders.
     *
     * This function is executed when a position is closed. It resets the `dcaCount` to zero,
     * clears pending orders associated with the current position, and adds an initial order
     * for the next trading sequence.
     *
     * @function positionClosed
     * @async
     * @param {Position} pos - The trading position object to be closed.
     * @returns {Promise<void>} Resolves when the process of resetting the position is complete.
     */
    const positionClosed = async (pos: Position) => {
        
        try {
            // Reset local state
            dcaCount = 0;
            lastAvgEntry = null;
            lastSize = 0;
            dcaQueue = [];
            activeDcaOrderId = null;

            // Clear internal order map (TP + SO ids)
            orders.clear();
            // Optional: clear any stray active orders on the book
            await clearPendingOrders();
        
            if (!(await hasEnoughMargin())) return;
        
            await start();
          } catch (error) {
            console.error(
              `${symbol}: Failed to handle position closed for ${side} with PnL ${pos.realisedPnl}:`,
              error
            );
          }
    };

    return {
        start,
        stop,
        positionChanged,
        positionClosed,
    };
};


export type Bot = ReturnType<typeof createBot>