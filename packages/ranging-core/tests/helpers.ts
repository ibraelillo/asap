import type { BacktestCandle, FeatureOverrides } from "../src/types";

export function candle(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 100,
  features?: FeatureOverrides,
): BacktestCandle {
  return {
    time,
    open,
    high,
    low,
    close,
    volume,
    features,
  };
}
