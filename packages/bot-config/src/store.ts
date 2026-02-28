// bot-store.ts
import {
  configureStore,
  createAsyncThunk,
  createSlice,
  PayloadAction,
} from "@reduxjs/toolkit";
import { KucoinService, Position } from "@repo/kucoin";
import crypto from "node:crypto";
import m from "redux-logger";
import { DcaConfigManager } from "./dca";
import { normalizePrice } from "./prices";

const cfgMgr = new DcaConfigManager();

const logger = m.createLogger();

export interface BotState {
  symbol: string;
  side: "LONG" | "SHORT";

  // dca
  dcaCount: number;
  dcaVolume: number;

  // Live
  active: boolean;
  avgEntryPrice: number | null;
  breakEven: number | null;
  tpPrice: number | null;

  // symbol
  leverage: number;
  priceMultiplier: number;
  tickSize: number;
}

const initialState: BotState = {
  avgEntryPrice: null,
  breakEven: null,
  tpPrice: null,
  dcaCount: -2,
  dcaVolume: 0,
  active: false,
};

/**
 *
 * @param preloaded
 * @param service
 */
export function createBotStore(preloaded?: BotState, service: KucoinService) {
  /**
   *
   */
  const normalize = createAsyncThunk(
    "bot/normalize",
    async (_: string, { getState }) => {
      const { symbol } = getState() as BotState;
      if (symbol) {
        return await service.market.normalize(symbol);
      }

      return undefined;
    },
  );

  /**
   *
   */
  const getCurrentPosition = createAsyncThunk(
    "bot/position",
    async (_: string, { getState, dispatch }) => {
      const { symbol, side } = getState() as BotState;
      if (symbol && side) {
        const positions = await service.positions.getPosition(symbol);

        const pos = positions.find((p) => p.positionSide === side);

        if (pos) {
          dispatch(botSlice.actions.positionChanged(pos));
        }
      }

      return undefined;
    },
  );

  /**
   *
   */
  const start = createAsyncThunk(
    "bot/start",
    async (_: string, { getState, dispatch }) => {
      const { symbol, side } = getState() as BotState;

      await dispatch(normalize(symbol));

      await dispatch(getCurrentPosition(symbol));

      return {};
    },
  );

  const clearPendingOrders = createAsyncThunk(
    "bot/clear",
    async (_, { getState }) => {
      const orders = await service.orders.getActiveOrders(
        (getState() as BotState).symbol,
      );
      await Promise.allSettled(
        orders.map((o) => service.orders.cancelOrder(o.orderId)),
      );
    },
  );

  // First, create the thunk
  const addTakeProfit = createAsyncThunk(
    "bot/setTakeProfit",
    async (_, { getState }) => {
      const state: BotState = getState() as BotState;

      console.log(`${state.symbol}: Settings TP at ${state.tpPrice}`);

      return await service.orders.addOrder({
        symbol: state.symbol,
        positionSide: state.side,
        side: state.side === "LONG" ? "sell" : "buy",
        leverage: state.leverage,
        type: "limit",
        reduceOnly: true,
        closeOrder: true,
        price: state.tpPrice?.toString(),
        clientOid: crypto.randomUUID(),
        marginMode: "CROSS",
      });
    },
  );

  /**
   *
   */
  const addSecurityOrder = createAsyncThunk(
    "bot/setSecurityOrder",
    async (_, { getState }) => {
      const state = getState() as BotState;
      const size = state.dcaVolume;

      const { cost, base } = cfgMgr.dca(state.symbol, state.dcaCount);

      if (!cost) return undefined;

      const factor = state.side === "LONG" ? 1 : -1;
      const delta = Math.abs(factor + cost.distancePct / 100);

      const nextDcaPrice = normalizePrice(
        state.avgEntryPrice! * delta,
        state.tickSize,
      );
      const nextSize = base * cost.sizeMult;

      return service.orders.addOrder({
        symbol: state.symbol,
        positionSide: state.side,
        valueQty: nextSize.toString(),
        side: state.side === "LONG" ? "buy" : "sell",
        leverage: state.leverage,
        type: "limit",
        price: nextDcaPrice.toString(),
        clientOid: crypto.randomUUID(),
        marginMode: "CROSS",
      });
    },
  );

  /**
   *
   */
  const addInitialOrder = createAsyncThunk(
    "bot/addInitialOrder",
    async (_, { getState }) => {
      const state = getState() as BotState;

      if (!state.symbol) {
        console.error("No symbol has been provided");
        throw new Error("No symbol has been provided");
      }

      if (state.active) return undefined;

      const { base } = cfgMgr.get(state.symbol);

      return service.orders.addOrder({
        symbol: state.symbol,
        positionSide: state.side,
        valueQty: base.toString(),
        side: state.side === "LONG" ? "buy" : "sell",
        leverage: state.leverage,
        type: "market",
        clientOid: crypto.randomUUID(),
        marginMode: "CROSS",
      });
    },
  );

  /**
   *
   */
  const botSlice = createSlice({
    name: "bot",
    initialState,
    reducers: {
      botLoaded(state, action: PayloadAction<BotState>) {
        return action.payload; // replace state
      },

      positionChanged(state, action: PayloadAction<Position>) {
        const position = action.payload;

        if (!position) return undefined;

        const cfg = cfgMgr.get(state.symbol);

        const avg = Number(action.payload.avgEntryPrice);
        const qty = Math.abs(position.currentCost);

        const totalFees =
          Number(position.currentComm ?? 0) + Number(position.posFunding ?? 0);

        const factor = state.side === "LONG" ? 1 : -1;

        const breakEven = avg + factor * (totalFees / qty);

        const delta = Math.abs(factor + cfg.takeProfitPct / 100);

        //console.log({ cfg, delta, breakEven });

        const tpPrice = normalizePrice(breakEven * delta, state.tickSize);

        const dcaVolume = qty;

        return {
          ...state,
          avgEntryPrice: avg,
          breakEven,
          dcaVolume,
          dcaCount: state.dcaCount + 1,
          tpPrice,
          active: position.isOpen,
        };
      },

      dcaFilled(state) {
        if (state.active) state.dcaCount++;

        return state;
      },

      positionClosed(state, action) {
        return { ...state, ...initialState };
      },
    },
    extraReducers: (builder) => {
      builder.addCase(normalize.fulfilled, (state, action) => {
        return {
          ...state,
          leverage: action.payload?.maxLeverage ?? 10,
          priceMultiplier: action.payload?.multiplier ?? 1,
          tickSize: action.payload?.tickSize ?? 0,
        };
      });

      builder.addCase(getCurrentPosition.fulfilled, (state, action) => {
        return state;
      });

      builder.addCase(start.fulfilled, (state, action) => {
        return {
          ...state,
          dcaCount: 0,
        };
      });

      // Add reducers for additional action types here, and handle loading state as needed
      builder.addCase(addTakeProfit.fulfilled, (state, action) => {
        // Add user to the state array
        state.tpOrderId = action.payload.orderId;

        return state;
      });
    },
  });

  const store = configureStore({
    reducer: botSlice.reducer,
    preloadedState: preloaded,
    /*middleware: (gdm) => {
            return process.env.NODE_ENV === 'production' ? gdm() : gdm().concat(logger)
        }*/
  });

  return {
    store,
    actions: {
      ...botSlice.actions,
      start,
      addInitialOrder,
      addTakeProfit,
      addSecurityOrder,
      clearPendingOrders,
    },
  };
}
