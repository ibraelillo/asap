import { TaapiClient } from "./client";
import {
  DEFAULT_TAAPI_REVERSAL_ALLOWLIST,
  TAAPI_REVERSAL_PATTERN_TIERS,
} from "./reversal-patterns";
import {
  TaapiReversalSignalSchema,
  type TaapiBulkConstruct,
  type TaapiReversalPattern,
  type TaapiReversalSignal,
  type TaapiReversalTier,
} from "./types";

export interface TaapiReversalSignalProviderOptions {
  minAbsoluteMatch?: number;
  tiers?: TaapiReversalTier[];
}

/**
 * High-level provider that scans TAAPI pattern-recognition endpoints and
 * converts raw match values into normalized reversal signals.
 */
export class TaapiReversalSignalProvider {
  constructor(private readonly client: TaapiClient) {}

  /**
   * Queries TAAPI in one bulk request and returns normalized reversal signals
   * filtered by tier and minimum match quality.
   */
  async scanLatest(input: {
    exchange: string;
    symbol: string;
    interval: TaapiBulkConstruct["interval"];
    patterns?: TaapiReversalPattern[];
    options?: TaapiReversalSignalProviderOptions;
  }): Promise<TaapiReversalSignal[]> {
    const allowedTiers = new Set(input.options?.tiers ?? ["high"]);
    const minAbsoluteMatch = input.options?.minAbsoluteMatch ?? 80;
    const requestedPatterns = input.patterns ?? DEFAULT_TAAPI_REVERSAL_ALLOWLIST;

    const filteredPatterns = requestedPatterns.filter((pattern) =>
      allowedTiers.has(TAAPI_REVERSAL_PATTERN_TIERS[pattern]),
    );
    const requestedPatternSet = new Set(filteredPatterns);

    if (filteredPatterns.length === 0) {
      return [];
    }

    const bulkResponse = await this.client.postBulk({
      construct: {
        exchange: input.exchange,
        symbol: input.symbol,
        interval: input.interval,
        indicators: filteredPatterns.map((pattern) => ({
          id: pattern,
          indicator: pattern,
        })),
      },
    });

    const signals = bulkResponse.data.flatMap((item) => {
      if (item.errors.length > 0) {
        return [];
      }
      const match = Number(item.result.value ?? 0);
      if (!requestedPatternSet.has(item.id as TaapiReversalPattern)) {
        return [];
      }
      if (!Number.isFinite(match) || Math.abs(match) < minAbsoluteMatch || match === 0) {
        return [];
      }

      const pattern = item.id as TaapiReversalPattern;
      return [
        TaapiReversalSignalSchema.parse({
          pattern,
          tier: TAAPI_REVERSAL_PATTERN_TIERS[pattern],
          match,
          direction: match > 0 ? "bullish" : "bearish",
          matchQuality: Math.min(1, Math.abs(match) / 100),
        }),
      ];
    });

    return signals.sort((left, right) => {
      const tierWeight = { high: 3, medium: 2, low: 1 } as const;
      const tierDelta = tierWeight[right.tier] - tierWeight[left.tier];
      if (tierDelta !== 0) return tierDelta;
      return Math.abs(right.match) - Math.abs(left.match);
    });
  }
}
