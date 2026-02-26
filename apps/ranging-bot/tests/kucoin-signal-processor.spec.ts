import { describe, expect, it, vi } from "vitest";
import type { KucoinService } from "@repo/kucoin";
import type { StrategySignalEvent } from "../src/contracts";
import { KucoinSignalProcessor } from "../src/exchanges/kucoin/signal-processor";

function buildEvent(signal: "long" | "short" | null): StrategySignalEvent {
  return {
    symbol: "SOLUSDTM",
    generatedAtMs: 1700000000000,
    decision: {
      signal,
      reasons: signal ? ["ok"] : ["none"],
    },
    snapshot: {
      time: 1700000000000,
      price: 100,
      range: {
        primary: { val: 95, vah: 110, poc: 101 },
        secondary: { val: 96, vah: 109, poc: 102 },
        effective: { val: 95.5, vah: 109.5, poc: 101.5 },
        overlapRatio: 0.8,
        isAligned: true,
      },
      bullishDivergence: signal === "long",
      bearishDivergence: signal === "short",
      moneyFlowSlope: signal === "long" ? 0.2 : -0.2,
      bullishSfp: signal === "long",
      bearishSfp: signal === "short",
    },
  };
}

describe("kucoin signal processor", () => {
  it("does nothing for null signal", async () => {
    const addOrder = vi.fn();

    const service = {
      positions: { getPosition: vi.fn().mockResolvedValue([]) },
      market: { normalize: vi.fn().mockResolvedValue({ maxLeverage: 10 }) },
      orders: { addOrder },
    } as unknown as KucoinService;

    const processor = new KucoinSignalProcessor(service, { dryRun: false });
    await processor.process(buildEvent(null));

    expect(addOrder).not.toHaveBeenCalled();
  });

  it("skips when existing position is already open", async () => {
    const addOrder = vi.fn();

    const service = {
      positions: {
        getPosition: vi.fn().mockResolvedValue([
          { positionSide: "LONG", isOpen: true, currentQty: 1 },
        ]),
      },
      market: { normalize: vi.fn().mockResolvedValue({ maxLeverage: 10 }) },
      orders: { addOrder },
    } as unknown as KucoinService;

    const processor = new KucoinSignalProcessor(service, { dryRun: false });
    await processor.process(buildEvent("long"));

    expect(addOrder).not.toHaveBeenCalled();
  });

  it("places entry order in live mode", async () => {
    const addOrder = vi.fn().mockResolvedValue({ orderId: "1" });

    const service = {
      positions: { getPosition: vi.fn().mockResolvedValue([]) },
      market: { normalize: vi.fn().mockResolvedValue({ maxLeverage: 25 }) },
      orders: { addOrder },
    } as unknown as KucoinService;

    const processor = new KucoinSignalProcessor(service, {
      dryRun: false,
      valueQty: "150",
    });

    await processor.process(buildEvent("short"));

    expect(addOrder).toHaveBeenCalledTimes(1);
    expect(addOrder.mock.calls[0][0]).toMatchObject({
      symbol: "SOLUSDTM",
      positionSide: "SHORT",
      side: "sell",
      valueQty: "150",
      type: "market",
    });
  });
});
