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

  it("fires long on armed re-entry after a recent VAL sweep", () => {
    const bot = createRangingBot({
      signal: {
        requireDivergence: true,
        requireSfp: true,
        allowArmedReentry: true,
        armedReentryMaxDistancePct: 0.5,
        priceExcursionLookbackBars: 4,
      },
    });

    const executionCandles = [
      candle(1, 100, 101, 99, 100),
      candle(2, 101, 103, 100, 102, 100, {
        rangeValid: true,
        val: 101,
        vah: 109,
        poc: 105,
        bullishDivergence: true,
        bearishDivergence: false,
        moneyFlowSlope: 0.4,
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

    expect(snapshot.recentLowBrokeVal).toBe(true);
    expect(decision.signal).toBe("long");
  });

  it("blocks armed re-entry when price is too far from VAL", () => {
    const bot = createRangingBot({
      signal: {
        requireDivergence: true,
        requireSfp: true,
        allowArmedReentry: true,
        armedReentryMaxDistancePct: 0.1,
        priceExcursionLookbackBars: 4,
      },
    });

    const executionCandles = [
      candle(1, 100, 101, 99, 100),
      candle(2, 101, 107, 100, 106, 100, {
        rangeValid: true,
        val: 101,
        vah: 109,
        poc: 105,
        bullishDivergence: true,
        bearishDivergence: false,
        moneyFlowSlope: 0.4,
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

    expect(snapshot.recentLowBrokeVal).toBe(true);
    expect(decision.signal).toBeNull();
    expect(decision.reasons).toContain("long_reentry_too_far_from_val");
  });
});
