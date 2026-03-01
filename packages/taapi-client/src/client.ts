import { z } from "zod";
import {
  TaapiBulkRequestSchema,
  TaapiBulkResponseSchema,
  TaapiDirectRequestBaseSchema,
  TaapiFibonacciHistoryResponseSchema,
  TaapiFibonacciLatestResponseSchema,
  TaapiManualIndicatorRequestSchema,
  TaapiPatternHistoryResponseSchema,
  TaapiPatternLatestResponseSchema,
  TaapiScalarHistoryResponseSchema,
  TaapiScalarLatestResponseSchema,
  type TaapiBulkRequest,
  type TaapiBulkResponse,
  type TaapiDirectRequestBase,
  type TaapiFibonacciHistoryResponse,
  type TaapiFibonacciLatestResponse,
  type TaapiManualIndicatorRequest,
  type TaapiPatternHistoryResponse,
  type TaapiPatternLatestResponse,
  type TaapiReversalPattern,
  type TaapiScalarHistoryResponse,
  type TaapiScalarLatestResponse,
  type TaapiSupportedScalarIndicator,
  type TaapiSupportedStructuredIndicator,
} from "./types";

export interface TaapiClientOptions {
  secret: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Thin, strongly-typed TAAPI REST client for the subset of endpoints used by
 * the trading platform.
 *
 * The client supports:
 * - direct GET indicator queries
 * - manual POST indicator queries using caller-provided candles
 * - bulk POST requests for efficient reversal-pattern scans
 */
export class TaapiClient {
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: TaapiClientOptions) {
    this.secret = options.secret.trim();
    this.baseUrl = (options.baseUrl ?? "https://api.taapi.io").replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /**
   * Executes a direct GET request for scalar indicators such as RSI or EMA.
   */
  async getScalarIndicator(
    indicator: TaapiSupportedScalarIndicator,
    request: TaapiDirectRequestBase & { period?: number },
  ): Promise<TaapiScalarLatestResponse | TaapiScalarHistoryResponse> {
    const params = this.buildDirectParams(request);
    if (request.period !== undefined) {
      params.set("period", String(request.period));
    }

    const response = await this.fetchJson(`${this.baseUrl}/${indicator}?${params.toString()}`);
    return this.parseLatestOrHistory(
      response,
      TaapiScalarLatestResponseSchema,
      TaapiScalarHistoryResponseSchema,
    );
  }

  /**
   * Executes a direct GET request for structured indicators such as Fibonacci
   * retracement.
   */
  async getStructuredIndicator(
    indicator: TaapiSupportedStructuredIndicator,
    request: TaapiDirectRequestBase,
  ): Promise<TaapiFibonacciLatestResponse | TaapiFibonacciHistoryResponse> {
    const params = this.buildDirectParams(request);
    const response = await this.fetchJson(`${this.baseUrl}/${indicator}?${params.toString()}`);
    return this.parseLatestOrHistory(
      response,
      TaapiFibonacciLatestResponseSchema,
      TaapiFibonacciHistoryResponseSchema,
    );
  }

  /**
   * Executes a direct GET request for pattern-recognition endpoints.
   */
  async getPattern(
    indicator: TaapiReversalPattern,
    request: TaapiDirectRequestBase,
  ): Promise<TaapiPatternLatestResponse | TaapiPatternHistoryResponse> {
    const params = this.buildDirectParams(request);
    const response = await this.fetchJson(`${this.baseUrl}/${indicator}?${params.toString()}`);
    return this.parseLatestOrHistory(
      response,
      TaapiPatternLatestResponseSchema,
      TaapiPatternHistoryResponseSchema,
    );
  }

  /**
   * Executes TAAPI's manual POST integration using a caller-provided candle set.
   *
   * The manual docs show the endpoint as `POST https://api.taapi.io/<indicator>`
   * with body `{ secret, candles, ...indicatorParams }`.
   */
  async postManualScalarIndicator(
    indicator: TaapiSupportedScalarIndicator,
    request: TaapiManualIndicatorRequest,
  ): Promise<TaapiScalarLatestResponse> {
    const body = TaapiManualIndicatorRequestSchema.parse(request);
    const response = await this.fetchJson(`${this.baseUrl}/${indicator}`, {
      method: "POST",
      body: JSON.stringify({ secret: this.secret, ...body }),
      headers: {
        "content-type": "application/json",
      },
    });
    return TaapiScalarLatestResponseSchema.parse(response);
  }

  /**
   * Executes TAAPI's bulk POST endpoint.
   */
  async postBulk(request: TaapiBulkRequest): Promise<TaapiBulkResponse> {
    const body = TaapiBulkRequestSchema.parse(request);
    const response = await this.fetchJson(`${this.baseUrl}/bulk`, {
      method: "POST",
      body: JSON.stringify({ secret: this.secret, ...body }),
      headers: {
        "content-type": "application/json",
      },
    });
    return TaapiBulkResponseSchema.parse(response);
  }

  private buildDirectParams(request: TaapiDirectRequestBase): URLSearchParams {
    const parsed = TaapiDirectRequestBaseSchema.parse(request);
    const params = new URLSearchParams({
      secret: this.secret,
      exchange: parsed.exchange,
      symbol: parsed.symbol,
      interval: parsed.interval,
    });

    if (parsed.backtrack !== undefined) params.set("backtrack", String(parsed.backtrack));
    if (parsed.results !== undefined) params.set("results", String(parsed.results));
    if (parsed.addResultTimestamp !== undefined) {
      params.set("addResultTimestamp", String(parsed.addResultTimestamp));
    }
    if (parsed.fromTimestamp !== undefined) {
      params.set("fromTimestamp", String(parsed.fromTimestamp));
    }
    if (parsed.toTimestamp !== undefined) {
      params.set("toTimestamp", String(parsed.toTimestamp));
    }
    if (parsed.chart) params.set("chart", parsed.chart);

    return params;
  }

  private async fetchJson(url: string, init?: RequestInit): Promise<unknown> {
    const response = await this.fetchFn(url, init);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`TAAPI request failed (${response.status}): ${text}`);
    }

    return text ? JSON.parse(text) : null;
  }

  private parseLatestOrHistory<TLatest, THistory>(
    payload: unknown,
    latestSchema: z.ZodType<TLatest>,
    historySchema: z.ZodType<THistory>,
  ): TLatest | THistory {
    const historyResult = historySchema.safeParse(payload);
    if (historyResult.success) {
      return historyResult.data;
    }
    return latestSchema.parse(payload);
  }
}
