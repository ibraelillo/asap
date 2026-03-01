import type { Candle } from "@repo/trading-core";
import type { IndicatorProvider, IndicatorRequest } from "@repo/market-context";
import { LocalIndicatorProvider } from "@repo/market-context";
import { TaapiClient } from "@repo/taapi-client";
import type { TaapiManualCandle, TaapiSupportedScalarIndicator } from "@repo/taapi-client";
import type {
  ComparisonRow,
  PreparedIndicatorMetadata,
  PreparedIndicatorProvider,
} from "./types";

function stableRequestKey(request: IndicatorRequest): string {
  const sortedParams = Object.keys(request.params)
    .sort()
    .map((key) => [key, request.params[key]]);
  return JSON.stringify([request.indicatorId, sortedParams]);
}

function toManualCandles(candles: Candle[]): TaapiManualCandle[] {
  return candles.map((candle) => ({
    timestamp: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
}

function numericDiffMap(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, number> {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const diffs: Record<string, number> = {};
  for (const key of keys) {
    const leftValue = left[key];
    const rightValue = right[key];
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      diffs[key] = leftValue - rightValue;
    }
  }
  return diffs;
}

function referenceSlice(candles: Candle[], lookbackBars: number): Candle[] {
  const referenceIndex = candles.length - lookbackBars;
  return candles.slice(0, referenceIndex + 1);
}

async function computeTaapiDivergence(input: {
  client: TaapiClient;
  indicator: "rsi" | "mfi";
  candles: Candle[];
  period: number;
  lookbackBars: number;
}): Promise<Record<string, boolean>> {
  const latestCandle = input.candles.at(-1);
  const referenceCandle = input.candles.at(-input.lookbackBars);
  if (!latestCandle || !referenceCandle) {
    return { bullish: false, bearish: false };
  }

  const current = await input.client.postManualScalarIndicator(input.indicator, {
    candles: toManualCandles(input.candles),
    period: input.period,
  });
  const reference = await input.client.postManualScalarIndicator(input.indicator, {
    candles: toManualCandles(referenceSlice(input.candles, input.lookbackBars)),
    period: input.period,
  });

  return {
    bullish: latestCandle.low < referenceCandle.low && current.value > reference.value,
    bearish: latestCandle.high > referenceCandle.high && current.value < reference.value,
  };
}

class InMemoryPreparedIndicatorProvider implements PreparedIndicatorProvider {
  constructor(
    private readonly values: Map<string, Record<string, unknown>>,
    private readonly metadata: Map<string, PreparedIndicatorMetadata>,
    private readonly fallbackProvider: IndicatorProvider,
  ) {}

  computeLatest(input: {
    candles: Candle[];
    request: IndicatorRequest;
  }): Record<string, unknown> {
    const key = stableRequestKey(input.request);
    return this.values.get(key) ?? this.fallbackProvider.computeLatest(input);
  }

  explain(request: IndicatorRequest): PreparedIndicatorMetadata | undefined {
    return this.metadata.get(stableRequestKey(request));
  }
}

/**
 * Materializes a TAAPI-backed provider that still satisfies the synchronous
 * `IndicatorProvider` contract expected by `@repo/market-context`.
 *
 * The network work happens up front. The returned provider is just an in-memory
 * snapshot provider and can therefore be consumed by the existing pure context
 * builder without any contract changes.
 */
export async function prepareTaapiIndicatorProvider(input: {
  client: TaapiClient;
  candles: Candle[];
  requests: IndicatorRequest[];
  fallbackProvider?: IndicatorProvider;
}): Promise<PreparedIndicatorProvider> {
  const fallbackProvider = input.fallbackProvider ?? new LocalIndicatorProvider();
  const values = new Map<string, Record<string, unknown>>();
  const metadata = new Map<string, PreparedIndicatorMetadata>();

  for (const request of input.requests) {
    const key = stableRequestKey(request);
    const length = Number(request.params.length ?? request.params.period ?? 14);
    const lookbackBars = Number(request.params.lookbackBars ?? 5);

    let value: Record<string, unknown> | undefined;
    let source: PreparedIndicatorMetadata["source"] = "local-fallback";

    switch (request.indicatorId) {
      case "rsi":
      case "mfi":
      case "ema":
      case "sma":
      case "obv": {
        const response = await input.client.postManualScalarIndicator(
          request.indicatorId as TaapiSupportedScalarIndicator,
          {
            candles: toManualCandles(input.candles),
            period:
              request.indicatorId === "obv" ? undefined : length,
          },
        );
        value = response;
        source = "taapi";
        break;
      }
      case "fibonacciretracement": {
        value = await input.client.postManualStructuredIndicator("fibonacciretracement", {
          candles: toManualCandles(input.candles),
        });
        source = "taapi";
        break;
      }
      case "rsidivergence": {
        value = await computeTaapiDivergence({
          client: input.client,
          indicator: "rsi",
          candles: input.candles,
          period: length,
          lookbackBars,
        });
        source = "taapi-derived";
        break;
      }
      case "mfidivergence": {
        value = await computeTaapiDivergence({
          client: input.client,
          indicator: "mfi",
          candles: input.candles,
          period: length,
          lookbackBars,
        });
        source = "taapi-derived";
        break;
      }
      default: {
        value = fallbackProvider.computeLatest({
          candles: input.candles,
          request,
        });
        source = "local-fallback";
      }
    }

    values.set(key, value);
    metadata.set(key, { source, request });
  }

  return new InMemoryPreparedIndicatorProvider(values, metadata, fallbackProvider);
}

/**
 * Compares TAAPI-backed outputs against a local provider for the same candle
 * set and request list. This is intended as the safety harness before any
 * TAAPI-derived values are trusted in shared feed workers.
 */
export async function compareIndicatorProviders(input: {
  client: TaapiClient;
  candles: Candle[];
  requests: IndicatorRequest[];
  localProvider?: IndicatorProvider;
}): Promise<ComparisonRow[]> {
  const localProvider = input.localProvider ?? new LocalIndicatorProvider();
  const taapiProvider = await prepareTaapiIndicatorProvider({
    client: input.client,
    candles: input.candles,
    requests: input.requests,
    fallbackProvider: localProvider,
  });

  return input.requests.map((request) => {
    const taapiValue = taapiProvider.computeLatest({ candles: input.candles, request });
    const localValue = localProvider.computeLatest({ candles: input.candles, request });
    const source = taapiProvider.explain(request)?.source ?? "local-fallback";

    return {
      request,
      taapiValue,
      localValue,
      source,
      equal: JSON.stringify(taapiValue) === JSON.stringify(localValue),
      numericDiffs: numericDiffMap(taapiValue, localValue),
    };
  });
}
