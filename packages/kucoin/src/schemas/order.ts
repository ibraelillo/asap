import { z } from "zod";
import { nodeUuid } from "../adapters.js";

// ---------- Enums ----------
export const OrderSideSchema = z.enum(["buy", "sell"]);
export type OrderSide = z.infer<typeof OrderSideSchema>;

export const OrderTypeSchema = z.enum(["limit", "market"]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const StopTypeSchema = z.enum(["down", "up"]);
export type StopType = z.infer<typeof StopTypeSchema>;

export const StopPriceTypeSchema = z.enum(["TP", "MP", "IP"]);
export type StopPriceType = z.infer<typeof StopPriceTypeSchema>;

export const MarginModeSchema = z.enum(["ISOLATED", "CROSS"]);
export type MarginMode = z.infer<typeof MarginModeSchema>;

export const TimeInForceSchema = z.enum(["GTC", "IOC"]);
export type TimeInForce = z.infer<typeof TimeInForceSchema>;

export const STPSchema = z.enum(["CN", "CO", "CB"]);
export type STP = z.infer<typeof STPSchema>;

export const PositionSideSchema = z.enum(["BOTH", "LONG", "SHORT"]);
export type PositionSide = z.infer<typeof PositionSideSchema>;

// ---------- Main Schema ----------
export const schema = z.object({
  clientOid: z.string().max(40).default(nodeUuid()),

  side: OrderSideSchema,
  symbol: z.string(),

  leverage: z.number().int(),

  type: OrderTypeSchema.optional().default("limit"),
  remark: z.string().max(100).optional(),

  // Stop order
  stop: StopTypeSchema.optional(),
  stopPriceType: StopPriceTypeSchema.optional(),
  stopPrice: z.string().optional(),

  // Flags
  reduceOnly: z.boolean().optional(),
  closeOrder: z.boolean().optional(),
  forceHold: z.boolean().optional(),
  stp: STPSchema.optional(),
  marginMode: MarginModeSchema.optional().default("CROSS"),

  // Order specifics
  price: z.string().optional(),
  size: z.number().optional(),
  qty: z.string().optional(),
  valueQty: z.string().optional(),
  timeInForce: TimeInForceSchema.optional(),
  postOnly: z.boolean().optional(),
  hidden: z.boolean().optional(),
  iceberg: z.boolean().optional(),
  visibleSize: z.string().optional(),
  positionSide: PositionSideSchema.optional(),
});

export const slTpSchema = schema.extend({
  triggerStopUpPrice: z.string().optional(), // Take profit price
  triggerStopDownPrice: z.string().optional(), // Stop loss price
});

// ---------- Derived Type ----------
export type AddOrderParams = z.infer<typeof schema>;
export type AddTPSLOrderParams = z.infer<typeof slTpSchema>;
