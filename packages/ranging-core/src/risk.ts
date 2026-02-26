import type { RiskConfig } from "./types";

export interface PositionSizingInput {
  equity: number;
  entryPrice: number;
  stopPrice: number;
  risk: RiskConfig;
}

export interface PositionSizingResult {
  quantity: number;
  riskAmount: number;
  stopDistance: number;
  notional: number;
  estimatedLossAtStop: number;
  usedNotionalCap: boolean;
}

function floorToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.floor(value / step) * step;
}

export function sizePosition(input: PositionSizingInput): PositionSizingResult {
  const { equity, entryPrice, stopPrice, risk } = input;

  if (!Number.isFinite(equity) || equity <= 0) {
    return {
      quantity: 0,
      riskAmount: 0,
      stopDistance: 0,
      notional: 0,
      estimatedLossAtStop: 0,
      usedNotionalCap: false,
    };
  }

  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) {
    return {
      quantity: 0,
      riskAmount: 0,
      stopDistance: 0,
      notional: 0,
      estimatedLossAtStop: 0,
      usedNotionalCap: false,
    };
  }

  const riskAmount = equity * risk.riskPctPerTrade;
  const quantityFromRisk = riskAmount / (stopDistance * risk.contractMultiplier);

  const maxNotional = equity * risk.leverage * risk.maxNotionalPctEquity;
  const quantityFromNotionalCap = maxNotional / (entryPrice * risk.contractMultiplier);

  const rawQty = Math.min(quantityFromRisk, quantityFromNotionalCap);
  const quantity = Math.max(0, floorToStep(rawQty, risk.lotStep));
  const notional = quantity * entryPrice * risk.contractMultiplier;
  const estimatedLossAtStop = quantity * stopDistance * risk.contractMultiplier;

  return {
    quantity,
    riskAmount,
    stopDistance,
    notional,
    estimatedLossAtStop,
    usedNotionalCap: quantityFromNotionalCap < quantityFromRisk,
  };
}
