import { buildDcaSteps } from "./builder";

export interface DcaStep {
  /** Percentage distance below/above avgEntryPrice */
  distancePct: number;

  /** Size multiplier relative to base order */
  sizeMult: number;
}

export interface DcaConfig {
  base: number;

  takeProfitPct: number;

  /** Ordered DCA ladder steps */
  steps: DcaStep[];

  /**
   * Optional per-symbol max DCAs override
   * If omitted, steps.length is the limit
   */
  maxDcas?: number;
}

// dca-default.ts
export const DefaultDcaConfig: DcaConfig = {
  base: 50,
  takeProfitPct: 0.55,
  steps: buildDcaSteps(
    1.2, // first at 1.2%
    1.3, // 1.3x base size
    1.4, // distance grows faster (1.4x)
    1.3,
  ),
};
