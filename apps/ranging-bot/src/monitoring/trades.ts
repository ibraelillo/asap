export interface TradeIdParts {
  symbol: string;
  generatedAtMs: number;
}

export function encodeTradeId(symbol: string, generatedAtMs: number): string {
  return `${encodeURIComponent(symbol)}:${generatedAtMs}`;
}

export function decodeTradeId(tradeId: string): TradeIdParts | null {
  const parts = tradeId.split(":");
  if (parts.length !== 2) return null;

  const symbolRaw = parts[0];
  const timeRaw = parts[1];

  if (!symbolRaw || !timeRaw) return null;

  const generatedAtMs = Number(timeRaw);
  if (!Number.isFinite(generatedAtMs) || generatedAtMs <= 0) return null;

  try {
    const symbol = decodeURIComponent(symbolRaw).trim();
    if (!symbol) return null;

    return {
      symbol,
      generatedAtMs: Math.floor(generatedAtMs),
    };
  } catch {
    return null;
  }
}
