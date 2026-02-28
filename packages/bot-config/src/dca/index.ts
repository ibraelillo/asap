// dca-config-manager.ts
import { DefaultDcaConfig } from "./config";
import { SymbolConfigs } from "./symbols";
import type { DcaConfig, DcaStep } from "./config";

export class DcaConfigManager {
  get(symbol: string): DcaConfig {
    // combine overrides with defaults
    const overrides = SymbolConfigs[symbol] ?? {};

    return {
      base: overrides.base ?? DefaultDcaConfig.base,
      takeProfitPct: overrides.takeProfitPct ?? DefaultDcaConfig.takeProfitPct,
      steps: overrides.steps ?? DefaultDcaConfig.steps,
      maxDcas: overrides.maxDcas ?? DefaultDcaConfig.maxDcas,
    };
  }

  /**
   * Return configuration for the i-th DCA event
   */
  dca(
    symbol: string,
    dcaCount: number,
  ): { cost: DcaStep | null; base: number } {
    const cfg = this.get(symbol);

    // If beyond ladder, null: ladder exhausted
    if (dcaCount >= (cfg.maxDcas ?? cfg.steps.length)) {
      return { cost: null, base: cfg.base };
    }

    return { cost: cfg.steps[dcaCount] ?? null, base: cfg.base };
  }
}
