/**
 * `@repo/taapi-client` is the typed TAAPI integration layer for the subset of
 * endpoints used by the trading platform. It is intentionally independent from
 * AWS, SST, exchanges, and runtime orchestration so it can be tested in
 * isolation.
 */
export * from "./types";
export * from "./reversal-patterns";
export * from "./client";
export * from "./provider";
