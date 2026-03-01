import { type TaapiReversalPattern, type TaapiReversalTier } from "./types";

/**
 * Reversal pattern tiering based on the user's ranking criteria:
 * multi-candle patterns with embedded confirmation are considered stronger
 * reversal evidence than single-candle or indecision patterns.
 */
export const TAAPI_REVERSAL_PATTERN_TIERS: Record<TaapiReversalPattern, TaapiReversalTier> = {
  morningstar: "high",
  eveningstar: "high",
  morningdojistar: "high",
  eveningdojistar: "high",
  abandonedbaby: "high",
  "3inside": "high",
  "3outside": "high",
  breakaway: "high",
  kicking: "high",
  kickingbylength: "high",
  tristar: "high",
  "3linestrike": "high",
  "3blackcrows": "high",
  "3whitesoldiers": "high",
  identical3crows: "high",
  engulfing: "medium",
  harami: "medium",
  haramicross: "medium",
  piercing: "medium",
  darkcloudcover: "medium",
  counterattack: "medium",
  belthold: "medium",
  "2crows": "medium",
  upsidegap2crows: "medium",
  concealbabyswall: "medium",
  ladderbottom: "medium",
  sticksandwich: "medium",
  matchinglow: "medium",
  homingpigeon: "medium",
  unique3river: "medium",
  stalledpattern: "medium",
  hikkake: "medium",
  hikkakemod: "medium",
  hammer: "low",
  invertedhammer: "low",
  shootingstar: "low",
  hangingman: "low",
  doji: "low",
  longleggeddoji: "low",
  rickshawman: "low",
  dragonflydoji: "low",
  gravestonedoji: "low",
  dojistar: "low",
  spinningtop: "low",
  highwave: "low",
  longline: "low",
  shortline: "low",
  marubozu: "low",
  closingmarubozu: "low",
};

export const HIGH_CONFIDENCE_REVERSAL_PATTERNS = Object.entries(
  TAAPI_REVERSAL_PATTERN_TIERS,
).flatMap(([pattern, tier]) => (tier === "high" ? [pattern as TaapiReversalPattern] : []));

export const MEDIUM_CONFIDENCE_REVERSAL_PATTERNS = Object.entries(
  TAAPI_REVERSAL_PATTERN_TIERS,
).flatMap(([pattern, tier]) => (tier === "medium" ? [pattern as TaapiReversalPattern] : []));

export const LOW_CONFIDENCE_REVERSAL_PATTERNS = Object.entries(
  TAAPI_REVERSAL_PATTERN_TIERS,
).flatMap(([pattern, tier]) => (tier === "low" ? [pattern as TaapiReversalPattern] : []));

/**
 * Default allowlist for "most confident reversal signals". This intentionally
 * keeps only the highest-confidence patterns by default.
 */
export const DEFAULT_TAAPI_REVERSAL_ALLOWLIST = HIGH_CONFIDENCE_REVERSAL_PATTERNS;
