import type { Candle, CandleFeedSnapshot, ExchangeKlineProvider, KlineQuery } from "@repo/trading-engine";

function normalizeCandles(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of candles) {
    byTime.set(candle.time, candle);
  }
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

export class SharedFeedBackedKlineProvider implements ExchangeKlineProvider {
  private readonly snapshotsByTimeframe: Map<string, CandleFeedSnapshot>;

  constructor(snapshots: CandleFeedSnapshot[]) {
    this.snapshotsByTimeframe = new Map(
      snapshots.map((snapshot) => [snapshot.timeframe, { ...snapshot, candles: normalizeCandles(snapshot.candles) }]),
    );
  }

  async fetchKlines(query: KlineQuery): Promise<Candle[]> {
    const snapshot = this.snapshotsByTimeframe.get(query.timeframe);
    if (!snapshot) {
      throw new Error(`Missing shared market snapshot for timeframe ${query.timeframe}`);
    }
    if (snapshot.symbol !== query.symbol) {
      throw new Error(`Shared market snapshot symbol mismatch for ${query.symbol} ${query.timeframe}`);
    }

    const endTimeMs = typeof query.endTimeMs === "number" ? query.endTimeMs : Number.POSITIVE_INFINITY;
    const filtered = snapshot.candles.filter((candle) => candle.time <= endTimeMs);
    return filtered.slice(-Math.max(1, query.limit));
  }
}
