/// <reference path="../../../sst-env.d.ts" />

import { event } from "sst/event";
import { z } from "zod";

/**
 * SST Event Builder Configuration
 *
 * Creates type-safe event builders using SST's event system.
 * Each builder validates events with Zod schemas before publishing to EventBridge.
 *
 * Benefits:
 * - Type safety: TypeScript knows the exact shape of each event
 * - Runtime validation: Zod ensures data integrity before publishing
 * - Auto-completion: IDE suggests available event types and fields
 * - Metadata: All events tagged with source: 'kucoin' for filtering
 *
 * @see https://sst.dev/docs/event
 */
const builder = event.builder({
  /**
   * Validator function using Zod schemas
   *
   * This function is called before publishing each event to EventBridge.
   * If validation fails, Zod throws an error with detailed field information.
   *
   * @param schema - Zod schema for the event type
   * @returns Validation function that parses data with the schema
   */
  validator: (schema) => (data) => schema.parse(data),

  /**
   * Metadata attached to all events
   *
   * This metadata is automatically added to every event published
   * through these builders. Useful for:
   * - Filtering events by source in EventBridge rules
   * - Tracking event origins in logs
   * - Debugging event flow
   */
  metadata: () => ({
    source: "orquestrator",
  }),
});

/**
 * Orchestrator Started Event Schema
 *
 * Triggered when the orchestrator service starts up and establishes
 * WebSocket connections to KuCoin.
 *
 * Published to EventBridge with detail-type: "orquestrator.started"
 *
 * Use cases:
 * - Notify Lambda functions that WebSocket is ready
 * - Trigger initial bot state synchronization
 * - Log orchestrator startup for monitoring
 */
export const OrquestratorStartedSchema = z.object({
  // Unix timestamp when orchestrator started (milliseconds)
  ts: z.number(),
  symbols: z.array(z.string()).optional(),
});

/**
 * Orchestrator Started Event Builder
 *
 * Publishes orchestrator startup events to EventBridge.
 * Lambda functions subscribe to this to know when WebSocket is ready.
 *
 * Usage:
 * ```typescript
 * await OrquestratorStarted.publish({ ts: Date.now() });
 * ```
 */
export const OrquestratorStarted = builder(
  "orquestrator.started",
  OrquestratorStartedSchema,
);

/**
 * Bot Started Event Schema
 *
 * Triggered when a trading bot is started/enabled.
 * Can identify bot by ID or by symbol + positionSide combination.
 *
 * Published to EventBridge with detail-type: "bot.started"
 *
 * Use cases:
 * - Subscribe orchestrator to new symbol WebSocket channels
 * - Initialize bot state in DynamoDB
 * - Log bot activation for monitoring
 *
 * Two identification methods:
 * 1. By ID: { id: "BOT#XBTUSDTM#LONG" }
 * 2. By symbol + side: { symbol: "XBTUSDTM", positionSide: "LONG" }
 */
export const BotStartedSchema = z
  .object({
    // Bot unique identifier (e.g., "BOT#XBTUSDTM#LONG")
    id: z.string(),
  })
  .or(
    z.object({
      // Trading pair symbol (e.g., "XBTUSDTM")
      symbol: z.string(),

      // Position side: "BOTH" (one-way mode), "LONG", or "SHORT" (hedge mode)
      positionSide: z
        .literal("LONG")
        .or(z.literal("SHORT"))
        .or(z.literal("BOTH")),
    }),
  );

/**
 * Bot Started Event Builder
 *
 * Publishes bot started events to EventBridge.
 * Orchestrator subscribes to this to add WebSocket subscriptions.
 *
 * Usage:
 * ```typescript
 * // By ID
 * await BotStarted.publish({ id: "BOT#XBTUSDTM#LONG" });
 *
 * // By symbol + side
 * await BotStarted.publish({
 *   symbol: "XBTUSDTM",
 *   positionSide: "LONG"
 * });
 * ```
 */
export const BotStarted = builder("bot.started", BotStartedSchema);

/**
 * Bot Stopped Event Builder
 *
 * Publishes bot stopped events to EventBridge.
 * Orchestrator subscribes to this to remove WebSocket subscriptions.
 *
 * Uses same schema as BotStarted for consistency.
 *
 * Usage:
 * ```typescript
 * // By ID
 * await BotStopped.publish({ id: "BOT#XBTUSDTM#LONG" });
 *
 * // By symbol + side
 * await BotStopped.publish({
 *   symbol: "XBTUSDTM",
 *   positionSide: "LONG"
 * });
 * ```
 */
export const BotStopped = builder("bot.stopped", BotStartedSchema);
