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
    side: "LONG" | "SHORT",
    service: KucoinService
) => {

    const orders = new Map<string, string>();
    let dcaQueue: Array<{ price: string; size: string; index: number }> = [];

    const cfg = cfgMgr.get(symbol);

    let dcaCount = 0;
    let lastAvgEntry = 0;
    let lastSize = 0;
    let activeDcaOrderId: string | null = null;

    const botPrefix = `[BOT ${symbol} ${side}]`;
    const now = () => new Date().toISOString();
    const state = () => ({
        dcaCount,
        queueLeft: dcaQueue.length,
        activeDcaOrderId,
        tpOrderId: orders.get("tp") ?? null,
        lastSize,
        lastAvgEntry,
    });
    const log = (event: string, details?: Record<string, unknown>) => {
        if (details) {
            console.log(`${now()} ${botPrefix} ${event}`, { ...details, ...state() });
            return;
        }

        console.log(`${now()} ${botPrefix} ${event}`, state());
    };
    const warn = (event: string, details?: Record<string, unknown>) => {
        if (details) {
            console.warn(`${now()} ${botPrefix} ${event}`, { ...details, ...state() });
            return;
        }

        console.warn(`${now()} ${botPrefix} ${event}`, state());
    };
    const err = (event: string, error: unknown, details?: Record<string, unknown>) => {
        if (details) {
            console.error(`${now()} ${botPrefix} ${event}`, { ...details, ...state() }, error);
            return;
        }

        console.error(`${now()} ${botPrefix} ${event}`, state(), error);
    };

    const sideLower: "long" | "short" = side === "LONG" ? "long" : "short";

    const isPositionOpen = (pos?: Position | null): pos is Position => {
        if (!pos || !pos.isOpen) return false;

        const qty = Math.abs(Number(pos.currentQty));
        const avg = Number(pos.avgEntryPrice);

        return qty > 0 && isFinite(qty) && avg > 0 && isFinite(avg);
    };

    const awaitOpenPosition = async (pos?: Position): Promise<Position | undefined> => {
        if (isPositionOpen(pos)) return pos;

        log("Waiting for confirmed open position", {
            incomingIsOpen: Boolean(pos?.isOpen),
            incomingQty: Number(pos?.currentQty ?? 0),
            incomingAvg: Number(pos?.avgEntryPrice ?? 0),
        });

        const refreshed = await service.positions.waitUntilPositionOpen(
            symbol,
            sideLower,
            5000,
            6
        );

        if (isPositionOpen(refreshed)) return refreshed;
        warn("Position did not confirm as open after retries");
        return undefined;
    };


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
            warn("Insufficient margin", {
                marginRequired: Number(marginRequired.toFixed(2)),
                availableBalance: Number(availableBalance.toFixed(2)),
            });
            return false;
        }
        
        log("Margin check passed", {
            marginRequired: Number(marginRequired.toFixed(2)),
            availableBalance: Number(availableBalance.toFixed(2)),
            leverage,
        });
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
        log("DCA queue prepared", {
            sourceAvg: avg,
            maxSteps,
            firstPrice: dcaQueue[0]?.price ?? null,
            lastPrice: dcaQueue[dcaQueue.length - 1]?.price ?? null,
        });
    }

    const addNextSecurityOrder = async () => {
        if (dcaQueue.length === 0) {
            log("No DCA steps left");
            return;
          }
        
          // Don't place a new SO if one is already working
          if (activeDcaOrderId) {
            log("Security order already active, skipping");
            return;
          }
        
          try {
            const { maxLeverage: leverage } = await sym;
            const order = dcaQueue.shift()!;
        
            if (order) {
              log("Placing security order", {
                step: order.index + 1,
                price: Number(order.price),
                valueQty: Number(order.size),
                leverage,
              });
        
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
              log("Security order placed", { orderId, step: order.index + 1 });
            }
          } catch (error) {
            err("Failed to place security order", error);
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

            log("Placing initial market order", { base, leverage });

            const result = await service.orders.addOrder({
                symbol: symbol,
                positionSide: side,
                valueQty: base.toString(),
                side: side === "LONG" ? "buy" : "sell",
                leverage: leverage,
                type: "market",
                clientOid: crypto.randomUUID(),
                marginMode: "CROSS",
            });
            log("Initial market order placed", { orderId: result.orderId, base });
            return result;
        } catch (error) {
            err("Failed to place initial order", error);
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
        
            log("Clearing pending orders", { pendingCount: filtered.length });
        
            filtered.forEach((o) =>
                log("Cancel pending order", {
                    orderId: o.id,
                    type: o.type,
                    side: o.side,
                    price: o.price,
                    size: o.size,
                })
            );
        
            await Promise.allSettled(
              filtered.map(async ({ id }) => {
                try {
                  await service.orders.cancelOrder(id);
                  log("Pending order cancelled", { orderId: id });
                } catch (e) {
                  err("Failed to cancel pending order", e, { orderId: id });
                }
              })
            );
        
            // reset local SO/TP state
            activeDcaOrderId = null;
            dcaQueue = [];
            dcaCount = 0;
            orders.clear();
            log("Pending-order cleanup completed");
        } catch (error) {
            err("Failed to clear pending orders", error);
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
        const livePos = await awaitOpenPosition(pos);
        if (!livePos) {
            warn("Skipping TP placement because position is not confirmed open");
            return undefined;
        }

        const avg = Number(livePos.avgEntryPrice);
        const size = Math.abs(Number(livePos.currentQty));

        if(lastAvgEntry !== avg || lastSize !== size) {

            try {
                if (orders.get("tp")) {
                    try {
                      const existingId = orders.get("tp")!;
                      const { cancelledOrderIds } = await service.orders.cancelOrder(existingId);
                      if (cancelledOrderIds.includes(existingId)) {
                        orders.delete("tp");
                        log("Previous TP order cancelled", { orderId: existingId });
                      }
                    } catch (e) {
                      // ignore TP cancel errors
                      warn("Failed to cancel previous TP; continuing with replacement", {
                        orderId: orders.get("tp") ?? null,
                      });
                    }
                }

                
                const { tickSize, maxLeverage } = await sym;

                if (!size || !isFinite(size)) {
                    throw new Error(`Invalid position size: ${livePos.currentQty}`);
                }

                const comm = Number(livePos.currentComm ?? 0.15);
                const funding = Number(livePos.posFunding ?? 0.15);

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

                log("Placing take-profit order", {
                    tpPrice,
                    breakEven,
                    qty: size,
                    avgEntry: avg,
                    tpPct: cfg.takeProfitPct,
                });

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
                log("Take-profit order placed", { orderId, tpPrice });
            } catch (error) {
                err("Failed to place take-profit order", error, { avgEntry: livePos.avgEntryPrice });
            }
        } else {
            log("Skipping TP update because avg/size unchanged", { avg, size });
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
            log("Bot start requested");
            await sym;
        
            const positions = await service.positions.getPosition(symbol);
            const pos = positions.find(
                (p) => p.positionSide === side && isPositionOpen(p)
            );
        
            if (pos) {
              log("Existing open position found at startup", {
                  avgEntry: Number(pos.avgEntryPrice),
                  size: Math.abs(Number(pos.currentQty)),
              });
        
              lastSize = Math.abs(Number(pos.currentQty));
              //lastAvgEntry = Number(pos.avgEntryPrice);
        
              await clearPendingOrders();
        
              await fillQueue(pos);
              await addTakeProfit(pos);
              await addNextSecurityOrder(); // no arg
            } else {
              log("No open position found at startup");
              if (!(await hasEnoughMargin())) return;
        
              await clearPendingOrders();
              await addInitialOrder();
            }
        } catch (error) {
            err("Bot start failed", error);
            throw error;
        }
    };

    const stop = async () => {
        log("Bot stop requested");
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

          log("Position update received", {
            incomingQty: size,
            incomingAvg: avg,
            isOpen: Boolean(pos.isOpen),
            reason: pos.changeReason ?? null,
          });
      
          if (!size || !isFinite(size)) {
            warn("Position update skipped due to invalid size", { incomingQty: pos.currentQty });
            return;
          }
      
          // First time we see this position
          if (lastSize === 0) {
            log("Initializing position tracking", { size, avg });
      
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
              log("Active DCA order disappeared from active orders, assuming filled", {
                orderId: activeDcaOrderId,
              });
      
              // That SO is now considered consumed
              activeDcaOrderId = null;
      
              await addTakeProfit(pos);   // update TP to new BE
              await addNextSecurityOrder(); // place next DCA, if any
            } else {
              // Order still active: this may be just a partial fill or price move.
              log("Active DCA order still open, no new SO", {
                orderId: activeDcaOrderId,
                size,
                lastSize,
              });
            }
          } else {
            // No active DCA order, but position changed (manual intervention, or restart)
            if (size > lastSize) {
              log("Position size increased with no active DCA order", {
                from: lastSize,
                to: size,
              });
              await addTakeProfit(pos);
              await addNextSecurityOrder();
            }
          }
      
          // Always update these at the end
          lastSize = size;
          lastAvgEntry = avg;
          log("Position tracking updated", { size, avg });
        } catch (error) {
          err("Failed to handle position update", error, { avgEntry: pos.avgEntryPrice });
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
            log("Position closed event received", {
                realisedPnl: Number(pos.realisedPnl ?? 0),
                closePrice: Number(pos.markPrice ?? 0),
            });
            // Reset local state
            dcaCount = 0;
            lastAvgEntry = 0;
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
            err("Failed to handle closed position", error, { realisedPnl: pos.realisedPnl });
          }
    };

    return {
        start,
        stop,
        positionChanged,
        positionClosed,
    };
};
