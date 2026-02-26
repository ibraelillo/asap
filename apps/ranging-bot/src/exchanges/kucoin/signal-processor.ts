import type { KucoinService } from "@repo/kucoin";
import type {
  SignalProcessingResult,
  SignalProcessor,
  StrategySignalEvent,
} from "../../contracts";

export interface KucoinSignalProcessorOptions {
  dryRun?: boolean;
  marginMode?: "CROSS" | "ISOLATED";
  valueQty?: string;
}

export class KucoinSignalProcessor implements SignalProcessor {
  private readonly options: Required<KucoinSignalProcessorOptions>;

  constructor(
    private readonly service: KucoinService,
    options?: KucoinSignalProcessorOptions,
  ) {
    this.options = {
      dryRun: options?.dryRun ?? true,
      marginMode: options?.marginMode ?? "CROSS",
      valueQty: options?.valueQty ?? "100",
    };
  }

  async process(event: StrategySignalEvent): Promise<SignalProcessingResult> {
    if (!event.decision.signal) {
      return { status: "no-signal" };
    }

    const positionSide = event.decision.signal === "long" ? "LONG" : "SHORT";
    const orderSide = event.decision.signal === "long" ? "buy" : "sell";

    const positions = await this.service.positions.getPosition(event.symbol);
    const existing = positions.find(
      (p) =>
        p.positionSide === positionSide &&
        p.isOpen &&
        Math.abs(Number(p.currentQty)) > 0,
    );

    if (existing) {
      return {
        status: "skipped-existing-position",
        side: event.decision.signal,
        message: "Open position already exists for this side.",
      };
    }

    if (this.options.dryRun) {
      console.log(`[kucoin-signal-processor][dry-run] ${event.symbol}`, {
        side: event.decision.signal,
        price: event.snapshot.price,
      });
      return {
        status: "dry-run",
        side: event.decision.signal,
      };
    }

    const symbolInfo = await this.service.market.normalize(event.symbol);
    if (!symbolInfo) {
      throw new Error(`Failed to normalize symbol: ${event.symbol}`);
    }

    const result = await this.service.orders.addOrder({
      symbol: event.symbol,
      positionSide,
      side: orderSide,
      type: "market",
      valueQty: this.options.valueQty,
      leverage: symbolInfo.maxLeverage,
      marginMode: this.options.marginMode,
      clientOid: crypto.randomUUID(),
    });

    return {
      status: "order-submitted",
      side: event.decision.signal,
      orderId: result.orderId,
      clientOid: result.clientOid,
    };
  }
}
