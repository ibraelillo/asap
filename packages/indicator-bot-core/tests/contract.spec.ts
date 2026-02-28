import { describe, expect, it } from "vitest";
import { createIndicatorBotStrategy } from "../src/index";

describe("indicator bot scaffold", () => {
  it("exposes a strategy contract", () => {
    const strategy = createIndicatorBotStrategy();
    expect(strategy.id).toBe("indicator-bot");
    expect(strategy.version).toBe("1");
  });
});
