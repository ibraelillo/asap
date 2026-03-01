import type { IndicatorProvider, IndicatorRequest } from "@repo/market-context";

/**
 * Tracks how each indicator value was obtained so comparisons and later live
 * rollout decisions can distinguish real TAAPI values from local fallbacks.
 */
export interface PreparedIndicatorMetadata {
  source: "taapi" | "taapi-derived" | "local-fallback";
  request: IndicatorRequest;
}

export interface PreparedIndicatorProvider extends IndicatorProvider {
  explain(request: IndicatorRequest): PreparedIndicatorMetadata | undefined;
}

export interface ComparisonRow {
  request: IndicatorRequest;
  taapiValue: Record<string, unknown>;
  localValue: Record<string, unknown>;
  source: PreparedIndicatorMetadata["source"];
  equal: boolean;
  numericDiffs: Record<string, number>;
}
