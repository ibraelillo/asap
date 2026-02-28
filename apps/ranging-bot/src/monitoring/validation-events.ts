import type { OrchestratorTimeframe } from "../contracts";

export const RANGE_VALIDATION_EVENT_SOURCE = "asap.ranging.validation";
export const RANGE_VALIDATION_EVENT_DETAIL_TYPE_REQUESTED = "range.validation.requested";

export interface RangeValidationRequestedDetail {
  validationId: string;
  createdAtMs: number;
  botId: string;
  botName: string;
  strategyId: string;
  symbol: string;
  timeframe: OrchestratorTimeframe;
  fromMs: number;
  toMs: number;
  candlesCount: number;
}
