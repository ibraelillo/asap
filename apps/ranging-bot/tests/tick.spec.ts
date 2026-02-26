import { describe, expect, it } from "vitest";
import { getClosedCandleEndTime, parseBotConfigs } from "../src/runtime-config";

describe("ranging tick runtime config", () => {
  it("parses valid bot configs and applies defaults", () => {
    const parsed = parseBotConfigs(
      JSON.stringify([
        {
          symbol: "XBTUSDTM",
        },
      ]),
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.symbol).toBe("XBTUSDTM");
    expect(parsed[0]?.executionTimeframe).toBe("15m");
    expect(parsed[0]?.primaryRangeTimeframe).toBe("1d");
    expect(parsed[0]?.secondaryRangeTimeframe).toBe("4h");
  });

  it("drops malformed configs", () => {
    const parsed = parseBotConfigs(
      JSON.stringify([
        {
          executionTimeframe: "15m",
        },
        {
          symbol: 123,
        },
      ]),
    );

    expect(parsed).toHaveLength(0);
  });

  it("computes closed-candle end time", () => {
    const now = Date.UTC(2026, 1, 26, 10, 17, 5, 500);
    const endTimeMs = getClosedCandleEndTime(now, "15m");

    expect(endTimeMs).toBe(Date.UTC(2026, 1, 26, 10, 15, 0, 0) - 1);
  });
});
