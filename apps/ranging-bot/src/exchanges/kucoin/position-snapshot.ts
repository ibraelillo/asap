import type { ExchangePositionSnapshot } from "@repo/trading-engine";

export function mapPositionSnapshot(
  position:
    | {
        symbol: string;
        positionSide: "LONG" | "SHORT" | "BOTH";
        currentQty: number;
        avgEntryPrice: number;
        isOpen: boolean;
      }
    | undefined,
): ExchangePositionSnapshot | null {
  if (!position) return null;
  const quantity = Math.abs(Number(position.currentQty ?? 0));
  const side = position.positionSide === "SHORT" ? "short" : "long";
  return {
    symbol: position.symbol,
    side,
    quantity,
    avgEntryPrice: Number(position.avgEntryPrice ?? 0) || undefined,
    isOpen: Boolean(position.isOpen) && quantity > 0,
  };
}
