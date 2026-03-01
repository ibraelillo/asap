import type { OrchestratorTimeframe } from "../contracts";
import type { RangeValidationRecord, RangeValidationResult } from "./types";

export interface ValidationIdentity {
  validationId: string;
  createdAtMs: number;
}

export interface CreateValidationInput {
  botId: string;
  deploymentId: string;
  botName: string;
  strategyId: string;
  symbol: string;
  timeframe: OrchestratorTimeframe;
  fromMs: number;
  toMs: number;
  candlesCount: number;
  modelPrimary: string;
  modelFallback: string;
  confidenceThreshold: number;
}

function newValidationId(symbol: string, createdAtMs: number): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

  return `${symbol}-${createdAtMs}-${suffix}`;
}

export function createValidationIdentity(
  symbol: string,
  createdAtMs = Date.now(),
): ValidationIdentity {
  return {
    createdAtMs,
    validationId: newValidationId(symbol, createdAtMs),
  };
}

export function createPendingValidationRecord(
  input: CreateValidationInput,
  identity: ValidationIdentity,
): RangeValidationRecord {
  return {
    id: identity.validationId,
    botId: input.botId,
    deploymentId: input.deploymentId,
    botName: input.botName,
    strategyId: input.strategyId,
    createdAtMs: identity.createdAtMs,
    status: "pending",
    symbol: input.symbol,
    timeframe: input.timeframe,
    fromMs: input.fromMs,
    toMs: input.toMs,
    candlesCount: input.candlesCount,
    modelPrimary: input.modelPrimary,
    modelFallback: input.modelFallback,
    confidenceThreshold: input.confidenceThreshold,
  };
}

export function createCompletedValidationRecord(
  base: RangeValidationRecord,
  result: RangeValidationResult,
  finalModel: string,
): RangeValidationRecord {
  return {
    ...base,
    status: "completed",
    finalModel,
    result,
    errorMessage: undefined,
  };
}

export function createFailedValidationRecord(
  base: RangeValidationRecord,
  errorMessage: string,
): RangeValidationRecord {
  return {
    ...base,
    status: "failed",
    errorMessage,
    result: undefined,
  };
}
