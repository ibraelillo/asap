import { describe, expect, it } from "vitest";
import { computeOverlapRatio, computeVolumeProfileLevels } from "../src/analysis/range";
import { candle } from "./helpers";

describe("volume profile range", () => {
  it("computes deterministic VAH/VAL/POC", () => {
    const candles = [
      candle(1, 100, 102, 99, 101, 120),
      candle(2, 101, 103, 100, 102, 250),
      candle(3, 102, 104, 101, 103, 400),
      candle(4, 103, 106, 102, 105, 900),
      candle(5, 105, 107, 104, 106, 500),
    ];

    const first = computeVolumeProfileLevels(candles, 16, 0.7);
    const second = computeVolumeProfileLevels(candles, 16, 0.7);

    expect(first).toEqual(second);
    expect(first.val).toBeLessThan(first.poc);
    expect(first.poc).toBeLessThan(first.vah);
  });

  it("computes overlap ratio between timeframes", () => {
    const daily = { val: 98, vah: 110, poc: 104 };
    const h4 = { val: 100, vah: 108, poc: 104 };

    const ratio = computeOverlapRatio(daily, h4);

    expect(ratio).toBeCloseTo(8 / 12, 8);
  });
});
