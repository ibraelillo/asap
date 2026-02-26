import { describe, expect, it } from "vitest";
import { createRangingBot } from "../src";
import { candle } from "./helpers";

describe("entry strategy", () => {
  it("fires long when all long gates pass", () => {
    const bot = createRangingBot({
      signal: {
        requireDivergence: true,
        requireSfp: true,
      },
    });

    const executionCandles = [
      candle(1, 100, 101, 99, 100),
      candle(2, 100, 101, 99, 100, 100, {
        rangeValid: true,
        val: 101,
        vah: 110,
        poc: 104,
        bullishDivergence: true,
        bearishDivergence: false,
        moneyFlowSlope: 0.3,
        bullishSfp: true,
        bearishSfp: false,
      }),
    ];

    const snapshot = bot.buildSignalSnapshot({
      executionCandles,
      index: 1,
      primaryRangeCandles: executionCandles,
      secondaryRangeCandles: executionCandles,
    });

    const decision = bot.evaluateEntry(snapshot);

    expect(decision.signal).toBe("long");
  });

  it("returns no signal when gates fail", () => {
    const bot = createRangingBot();

    const executionCandles = [
      candle(1, 100, 101, 99, 100),
      candle(2, 100, 101, 99, 100, 100, {
        rangeValid: false,
        val: 99,
        vah: 101,
        poc: 100,
        bullishDivergence: false,
        bearishDivergence: false,
        moneyFlowSlope: 0,
        bullishSfp: false,
        bearishSfp: false,
      }),
    ];

    const snapshot = bot.buildSignalSnapshot({
      executionCandles,
      index: 1,
      primaryRangeCandles: executionCandles,
      secondaryRangeCandles: executionCandles,
    });

    const decision = bot.evaluateEntry(snapshot);

    expect(decision.signal).toBeNull();
    expect(decision.reasons.length).toBeGreaterThan(0);
  });
});
