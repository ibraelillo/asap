import type { DeepPartial, RangeReversalConfig } from "./types";

export const defaultRangeReversalConfig: RangeReversalConfig = {
  range: {
    primaryLookbackBars: 40,
    secondaryLookbackBars: 120,
    bins: 24,
    valueAreaPct: 0.7,
    minOverlapPct: 0.6,
  },
  signal: {
    waveTrendChannelLength: 10,
    waveTrendAverageLength: 21,
    waveTrendSignalLength: 4,
    moneyFlowPeriod: 20,
    moneyFlowSlopeBars: 3,
    swingLookback: 3,
    requireDivergence: true,
    requireSfp: true,
    maxBarsAfterDivergence: 6,
  },
  risk: {
    riskPctPerTrade: 0.01,
    maxNotionalPctEquity: 1,
    leverage: 10,
    contractMultiplier: 1,
    lotStep: 0,
    feeRate: 0,
    slBufferPct: 0.0008,
  },
  exits: {
    tp1Level: "POC",
    tp2LongLevel: "VAH",
    tp2ShortLevel: "VAL",
    tp1SizePct: 0.5,
    tp2SizePct: 0.5,
    moveStopToBreakevenOnTp1: true,
    runnerExitOnOppositeSignal: true,
    cooldownBars: 1,
  },
  fillModel: {
    intrabarExitPriority: "stop-first",
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base;

  const out = { ...base } as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    if (isObject(value) && isObject(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }

    out[key] = value;
  }

  return out as T;
}

export function createConfig(overrides?: DeepPartial<RangeReversalConfig>): RangeReversalConfig {
  return deepMerge(defaultRangeReversalConfig, overrides);
}
