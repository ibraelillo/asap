/**
 * `@repo/market-context` exposes pure indicator and context-building services.
 * It turns candles into versioned, serializable decision inputs without any
 * exchange, storage, or infrastructure dependency.
 */
export * from "./types";
export * from "./local-indicator-provider";
export * from "./context-builder";
