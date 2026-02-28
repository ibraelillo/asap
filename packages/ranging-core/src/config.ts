import type {
  StrategyConfigJsonSchema,
  StrategyConfigUiField,
} from "@repo/trading-engine";
import { z } from "zod";
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
    priceExcursionLookbackBars: 8,
    allowArmedReentry: true,
    armedReentryMaxDistancePct: 0.5,
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

const rangeLevelSchema = z.enum(["VAL", "VAH", "POC"]);
const intrabarExitPrioritySchema = z.enum(["stop-first", "target-first"]);

export const rangeReversalConfigSchema = z.object({
  range: z.object({
    primaryLookbackBars: z.number().int().min(10).default(40),
    secondaryLookbackBars: z.number().int().min(20).default(120),
    bins: z.number().int().min(8).max(80).default(24),
    valueAreaPct: z.number().min(0.5).max(0.95).default(0.7),
    minOverlapPct: z.number().min(0.1).max(1).default(0.6),
  }),
  signal: z.object({
    waveTrendChannelLength: z.number().int().min(2).default(10),
    waveTrendAverageLength: z.number().int().min(2).default(21),
    waveTrendSignalLength: z.number().int().min(1).default(4),
    moneyFlowPeriod: z.number().int().min(2).default(20),
    moneyFlowSlopeBars: z.number().int().min(1).default(3),
    swingLookback: z.number().int().min(1).default(3),
    requireDivergence: z.boolean().default(true),
    requireSfp: z.boolean().default(true),
    maxBarsAfterDivergence: z.number().int().min(1).max(20).default(6),
    priceExcursionLookbackBars: z.number().int().min(1).max(30).default(8),
    allowArmedReentry: z.boolean().default(true),
    armedReentryMaxDistancePct: z.number().min(0.05).max(5).default(0.5),
  }),
  risk: z.object({
    riskPctPerTrade: z.number().min(0.001).max(0.05).default(0.01),
    maxNotionalPctEquity: z.number().min(0.01).max(10).default(1),
    leverage: z.number().int().min(1).max(100).default(10),
    contractMultiplier: z.number().positive().default(1),
    lotStep: z.number().min(0).default(0),
    feeRate: z.number().min(0).default(0),
    slBufferPct: z.number().min(0).max(0.02).default(0.0008),
  }),
  exits: z.object({
    tp1Level: rangeLevelSchema.default("POC"),
    tp2LongLevel: rangeLevelSchema.default("VAH"),
    tp2ShortLevel: rangeLevelSchema.default("VAL"),
    tp1SizePct: z.number().min(0).max(1).default(0.5),
    tp2SizePct: z.number().min(0).max(1).default(0.5),
    moveStopToBreakevenOnTp1: z.boolean().default(true),
    runnerExitOnOppositeSignal: z.boolean().default(true),
    cooldownBars: z.number().int().min(0).max(20).default(1),
  }),
  fillModel: z.object({
    intrabarExitPriority: intrabarExitPrioritySchema.default("stop-first"),
  }),
});

export const rangeReversalConfigJsonSchema = z.toJSONSchema(
  rangeReversalConfigSchema,
) as StrategyConfigJsonSchema;

export const rangeReversalConfigUi: StrategyConfigUiField[] = [
  {
    path: "range.primaryLookbackBars",
    widget: "number",
    label: "Primary lookback bars",
    description: "Bars used to build the higher-timeframe range context.",
    section: "Range",
    order: 10,
  },
  {
    path: "range.secondaryLookbackBars",
    widget: "number",
    label: "Secondary lookback bars",
    description: "Bars used to build the lower supporting range context.",
    section: "Range",
    order: 20,
  },
  {
    path: "range.bins",
    widget: "number",
    label: "Volume profile bins",
    description: "Histogram precision for value-area estimation.",
    section: "Range",
    order: 30,
  },
  {
    path: "range.valueAreaPct",
    widget: "number",
    label: "Value area %",
    description: "Share of volume used to define VAL and VAH.",
    section: "Range",
    order: 40,
  },
  {
    path: "range.minOverlapPct",
    widget: "number",
    label: "Minimum overlap %",
    description: "Required overlap between higher-timeframe ranges.",
    section: "Range",
    order: 50,
  },
  {
    path: "signal.requireDivergence",
    widget: "boolean",
    label: "Require divergence",
    description: "Gate entries behind price/oscillator divergence.",
    section: "Signals",
    order: 60,
  },
  {
    path: "signal.requireSfp",
    widget: "boolean",
    label: "Require SFP",
    description: "Gate entries behind a swing failure pattern confirmation.",
    section: "Signals",
    order: 70,
  },
  {
    path: "signal.maxBarsAfterDivergence",
    widget: "number",
    label: "Max bars after divergence",
    description: "Maximum delay between divergence and confirmation.",
    section: "Signals",
    order: 80,
  },
  {
    path: "signal.priceExcursionLookbackBars",
    widget: "number",
    label: "Excursion lookback bars",
    description: "Bars used to detect recent sweep outside the range.",
    section: "Signals",
    order: 90,
  },
  {
    path: "signal.allowArmedReentry",
    widget: "boolean",
    label: "Allow armed re-entry",
    description: "Permit re-entry after a sweep/reclaim near the range edge.",
    section: "Signals",
    order: 100,
  },
  {
    path: "signal.armedReentryMaxDistancePct",
    widget: "number",
    label: "Armed re-entry max distance %",
    description:
      "How far price may re-enter before the sweep is considered stale.",
    section: "Signals",
    order: 110,
  },
  {
    path: "risk.riskPctPerTrade",
    widget: "number",
    label: "Risk % per trade",
    description: "Fraction of equity risked between entry and stop.",
    section: "Risk",
    order: 120,
  },
  {
    path: "risk.maxNotionalPctEquity",
    widget: "number",
    label: "Max notional % equity",
    description: "Upper bound for deployed notional relative to equity.",
    section: "Risk",
    order: 130,
  },
  {
    path: "risk.leverage",
    widget: "number",
    label: "Leverage",
    description: "Execution leverage used in sizing and exchange submission.",
    section: "Risk",
    order: 140,
  },
  {
    path: "risk.contractMultiplier",
    widget: "number",
    label: "Contract multiplier",
    section: "Risk",
    order: 150,
  },
  {
    path: "risk.lotStep",
    widget: "number",
    label: "Lot step",
    section: "Risk",
    order: 160,
  },
  {
    path: "risk.feeRate",
    widget: "number",
    label: "Fee rate",
    section: "Risk",
    order: 170,
  },
  {
    path: "risk.slBufferPct",
    widget: "number",
    label: "Stop buffer %",
    description: "Extra stop distance below or above the SFP wick.",
    section: "Risk",
    order: 180,
  },
  {
    path: "exits.tp1Level",
    widget: "select",
    label: "TP1 level",
    section: "Exits",
    order: 190,
  },
  {
    path: "exits.tp2LongLevel",
    widget: "select",
    label: "TP2 long level",
    section: "Exits",
    order: 200,
  },
  {
    path: "exits.tp2ShortLevel",
    widget: "select",
    label: "TP2 short level",
    section: "Exits",
    order: 210,
  },
  {
    path: "exits.tp1SizePct",
    widget: "number",
    label: "TP1 size %",
    description:
      "Fraction of the position reduced at TP1. Set to 0 to disable.",
    section: "Exits",
    order: 220,
  },
  {
    path: "exits.tp2SizePct",
    widget: "number",
    label: "TP2 size %",
    description:
      "Fraction of the position reduced at TP2. Set to 0 to disable.",
    section: "Exits",
    order: 230,
  },
  {
    path: "exits.moveStopToBreakevenOnTp1",
    widget: "boolean",
    label: "Move stop to breakeven on TP1",
    section: "Exits",
    order: 240,
  },
  {
    path: "exits.runnerExitOnOppositeSignal",
    widget: "boolean",
    label: "Exit runner on opposite signal",
    section: "Exits",
    order: 250,
  },
  {
    path: "exits.cooldownBars",
    widget: "number",
    label: "Cooldown bars",
    section: "Exits",
    order: 260,
  },
  {
    path: "fillModel.intrabarExitPriority",
    widget: "select",
    label: "Intrabar exit priority",
    section: "Execution",
    order: 270,
  },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base;

  const out = { ...base } as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    if (isObject(value) && isObject(out[key])) {
      out[key] = deepMerge(
        out[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }

    out[key] = value;
  }

  return out as T;
}

export function createConfig(
  overrides?: DeepPartial<RangeReversalConfig>,
): RangeReversalConfig {
  return rangeReversalConfigSchema.parse(
    deepMerge(defaultRangeReversalConfig, overrides),
  );
}
