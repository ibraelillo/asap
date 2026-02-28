// dca-symbols.ts
import { DcaConfig } from "./config";

import { buildDcaSteps } from "./builder"; // path = where you put the helper

export const SymbolConfigs: Record<string, Partial<DcaConfig>> = {
  // BTC: relatively stable → closer first DCA, moderate growth
  BTCUSDTM: {
    base: 40,
    takeProfitPct: 0.22, // 0.22% TP for high-frequency
    maxDcas: 10,
    steps: buildDcaSteps(
      0.7, // first DCA at 0.7% from entry
      1.2, // first DCA 1.2x base size
      1.35, // distance grows x1.35 each step (until step 8)
      1.25, // size grows x1.25 each step (until step 8)
    ),
  },

  // PEPE: more volatile → wider distances, slightly bigger sizes
  PEPEUSDTM: {
    base: 20,
    takeProfitPct: 0.32, // 0.32% TP for quick scalps, covers fees
    maxDcas: 10,
    steps: buildDcaSteps(
      1.2, // first at 1.2%
      1.3, // 1.3x base size
      1.4, // distance grows faster (1.4x)
      1.3,
    ),
  },

  // TRUMP: similar profile to PEPE
  TRUMPUSDTM: {
    base: 20,
    takeProfitPct: 0.35,
    maxDcas: 10,
    steps: buildDcaSteps(
      1.0, // 1.0%
      1.4,
      1.4,
      1.3,
    ),
  },

  // AVAX: midcap, decent liquidity
  AVAXUSDTM: {
    base: 30,
    takeProfitPct: 0.28,
    maxDcas: 10,
    steps: buildDcaSteps(0.8, 1.3, 1.35, 1.25),
  },

  // BCH: midcap, bursty moves
  BCHUSDTM: {
    base: 30,
    takeProfitPct: 0.28,
    maxDcas: 10,
    steps: buildDcaSteps(0.9, 1.3, 1.35, 1.25),
  },

  // DOGE: meme, but super liquid
  DOGEUSDTM: {
    base: 20,
    takeProfitPct: 0.3,
    maxDcas: 10,
    steps: buildDcaSteps(0.9, 1.3, 1.35, 1.3),
  },

  // XRP: liquid, mid volatility
  XRPUSDTM: {
    base: 20,
    takeProfitPct: 0.26,
    maxDcas: 10,
    steps: buildDcaSteps(0.8, 1.25, 1.35, 1.25),
  },

  // ENA: newer, more spiky
  ENAUSDTM: {
    base: 20,
    takeProfitPct: 0.32,
    maxDcas: 10,
    steps: buildDcaSteps(1.0, 1.3, 1.4, 1.3),
  },
};
