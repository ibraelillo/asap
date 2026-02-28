import type { KucoinService } from "@repo/kucoin";
import type {
  ExchangePositionSnapshot,
  SignalProcessingResult,
  SignalProcessor,
  StrategySignalEvent,
} from "../../contracts";

export interface KucoinSignalProcessorOptions {
  dryRun?: boolean;
  marginMode?: "CROSS" | "ISOLATED";
  valueQty?: string;
}

function mapPositionSnapshot(
  position: {
    symbol: string;
    positionSide: "LONG" | "SHORT" | "BOTH";
    currentQty: number;
    avgEntryPrice: number;
    isOpen: boolean;
  } | undefined,
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

export class KucoinSignalProcessor<TSnapshot = unknown, TMeta = unknown>
implements SignalProcessor<TSnapshot, TMeta> {
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

  async process(event: StrategySignalEvent<TSnapshot, TMeta>): Promise<SignalProcessingResult> {
    const enterIntent = event.decision.intents.find((intent) => intent.kind === "enter");
    const closeIntent = event.decision.intents.find((intent) => intent.kind === "close");

    const positions = await this.service.positions.getPosition(event.symbol);
    const snapshots = positions
      .map((position) => mapPositionSnapshot(position))
      .filter((snapshot): snapshot is ExchangePositionSnapshot => Boolean(snapshot && snapshot.isOpen));

    const existingForEnter = enterIntent
      ? snapshots.find((snapshot) => snapshot.side === enterIntent.side)
      : undefined;

    if (existingForEnter) {
      return {
        status: "skipped-existing-position",
        side: existingForEnter.side,
        message: "Open position already exists for this side.",
        positionSnapshot: existingForEnter,
      };
    }

    if (!enterIntent && !closeIntent) {
      return {
        status: snapshots.length > 0 ? "synced-position" : "no-signal",
        positionSnapshot: snapshots[0] ?? null,
      };
    }

    if (closeIntent) {
      const openPosition = snapshots.find((snapshot) => snapshot.side === closeIntent.side);
      if (!openPosition) {
        return {
          status: "no-signal",
          message: "Close intent received but no matching open exchange position was found.",
        };
      }

      const orderSide = closeIntent.side === "long" ? "sell" : "buy";
      if (this.options.dryRun) {
        console.log(`[kucoin-signal-processor][dry-run-close] ${event.symbol}`, {
          botId: event.bot.id,
          side: closeIntent.side,
          quantity: openPosition.quantity,
        });
        return {
          status: "dry-run",
          side: closeIntent.side,
          positionSnapshot: openPosition,
          message: "close-intent-dry-run",
        };
      }

      const symbolInfo = await this.service.market.normalize(event.symbol);
      if (!symbolInfo) {
        throw new Error(`Failed to normalize symbol: ${event.symbol}`);
      }

      const result = await this.service.orders.addOrder({
        symbol: event.symbol,
        positionSide: closeIntent.side === "long" ? "LONG" : "SHORT",
        side: orderSide,
        type: "market",
        qty: String(openPosition.quantity),
        leverage: symbolInfo.maxLeverage,
        marginMode: this.options.marginMode,
        reduceOnly: true,
        closeOrder: true,
        clientOid: crypto.randomUUID(),
      });

      return {
        status: "order-submitted",
        side: closeIntent.side,
        orderId: result.orderId,
        clientOid: result.clientOid,
        positionSnapshot: openPosition,
      };
    }

    if (!enterIntent) {
      return { status: "no-signal", positionSnapshot: snapshots[0] ?? null };
    }

    const positionSide = enterIntent.side === "long" ? "LONG" : "SHORT";
    const orderSide = enterIntent.side === "long" ? "buy" : "sell";

    if (this.options.dryRun) {
      console.log(`[kucoin-signal-processor][dry-run] ${event.symbol}`, {
        botId: event.bot.id,
        side: enterIntent.side,
        price: event.generatedAtMs,
      });
      return {
        status: "dry-run",
        side: enterIntent.side,
        positionSnapshot: snapshots[0] ?? null,
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
      side: enterIntent.side,
      orderId: result.orderId,
      clientOid: result.clientOid,
      positionSnapshot: snapshots[0] ?? null,
    };
  }
}
