import type { KucoinService } from "@repo/kucoin";
import type {
  ExchangePositionSnapshot,
  SignalProcessingResult,
  SignalProcessor,
  StrategySignalEvent,
} from "../../contracts";
import { mapPositionSnapshot } from "./position-snapshot";

export interface KucoinSignalProcessorOptions {
  dryRun?: boolean;
  marginMode?: "CROSS" | "ISOLATED";
  valueQty?: string;
}

async function fetchOpenSnapshots(
  service: KucoinService,
  symbol: string,
): Promise<ExchangePositionSnapshot[]> {
  const positions = await service.positions.getPosition(symbol);
  return positions
    .map((position) => mapPositionSnapshot(position))
    .filter((snapshot): snapshot is ExchangePositionSnapshot =>
      Boolean(snapshot && snapshot.isOpen),
    );
}

export class KucoinSignalProcessor<TSnapshot = unknown, TMeta = unknown>
  implements SignalProcessor<TSnapshot, TMeta>
{
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

  async process(
    event: StrategySignalEvent<TSnapshot, TMeta>,
  ): Promise<SignalProcessingResult> {
    const enterIntent = event.decision.intents.find(
      (intent) => intent.kind === "enter",
    );
    const closeIntent = event.decision.intents.find(
      (intent) => intent.kind === "close",
    );

    const snapshots = await fetchOpenSnapshots(this.service, event.symbol);

    const existingForEnter = enterIntent
      ? snapshots.find((snapshot) => snapshot.side === enterIntent.side)
      : undefined;

    if (existingForEnter) {
      return {
        status: "skipped-existing-position",
        side: existingForEnter.side,
        message: "Open position already exists for this side.",
        exchangeSnapshots: snapshots,
        positionSnapshot: existingForEnter,
        reconciliation: {
          status: "ok",
          message: "existing_position_on_exchange",
        },
      };
    }

    if (!enterIntent && !closeIntent) {
      return {
        status: snapshots.length > 0 ? "synced-position" : "no-signal",
        exchangeSnapshots: snapshots,
        positionSnapshot: snapshots[0] ?? null,
        reconciliation: {
          status: "ok",
          message:
            snapshots.length > 0
              ? "exchange_positions_synced"
              : "exchange_flat",
        },
      };
    }

    if (closeIntent) {
      const openPosition = snapshots.find(
        (snapshot) => snapshot.side === closeIntent.side,
      );
      if (!openPosition) {
        return {
          status: "no-signal",
          message:
            "Close intent received but no matching open exchange position was found.",
          exchangeSnapshots: snapshots,
          reconciliation: {
            status: "drift",
            message: "close_intent_without_exchange_position",
          },
        };
      }

      const orderSide = closeIntent.side === "long" ? "sell" : "buy";
      if (this.options.dryRun) {
        console.log(
          `[kucoin-signal-processor][dry-run-close] ${event.symbol}`,
          {
            botId: event.bot.id,
            side: closeIntent.side,
            quantity: openPosition.quantity,
          },
        );
        return {
          status: "dry-run",
          side: closeIntent.side,
          exchangeSnapshots: snapshots,
          positionSnapshot: openPosition,
          message: "close-intent-dry-run",
          reconciliation: {
            status: "ok",
            message: "close_intent_dry_run",
          },
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

      const updatedSnapshots = await fetchOpenSnapshots(
        this.service,
        event.symbol,
      );
      const matchingSnapshot = updatedSnapshots.find(
        (snapshot) => snapshot.side === closeIntent.side,
      );
      const orderStatus = matchingSnapshot ? "submitted" : "filled";

      return {
        status: "order-submitted",
        side: closeIntent.side,
        orderId: result.orderId,
        clientOid: result.clientOid,
        order: {
          purpose: "close",
          status: orderStatus,
          requestedQuantity: openPosition.quantity,
          executedQuantity:
            orderStatus === "filled" ? openPosition.quantity : undefined,
          externalOrderId: result.orderId,
          clientOid: result.clientOid,
        },
        exchangeSnapshots: updatedSnapshots,
        positionSnapshot: matchingSnapshot ?? updatedSnapshots[0] ?? null,
        reconciliation: {
          status: "ok",
          message:
            orderStatus === "filled" ? "close_confirmed" : "close_submitted",
        },
      };
    }

    if (!enterIntent) {
      return {
        status: "no-signal",
        exchangeSnapshots: snapshots,
        positionSnapshot: snapshots[0] ?? null,
        reconciliation: {
          status: "ok",
          message:
            snapshots.length > 0
              ? "exchange_positions_synced"
              : "exchange_flat",
        },
      };
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
        exchangeSnapshots: snapshots,
        positionSnapshot: snapshots[0] ?? null,
        reconciliation: {
          status: "ok",
          message: "entry_intent_dry_run",
        },
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

    const updatedSnapshots = await fetchOpenSnapshots(
      this.service,
      event.symbol,
    );
    const matchingSnapshot = updatedSnapshots.find(
      (snapshot) => snapshot.side === enterIntent.side,
    );
    const orderStatus = matchingSnapshot ? "filled" : "submitted";

    return {
      status: "order-submitted",
      side: enterIntent.side,
      orderId: result.orderId,
      clientOid: result.clientOid,
      order: {
        purpose: "entry",
        status: orderStatus,
        requestedValueQty: this.options.valueQty,
        executedPrice: matchingSnapshot?.avgEntryPrice,
        executedQuantity: matchingSnapshot?.quantity,
        externalOrderId: result.orderId,
        clientOid: result.clientOid,
      },
      exchangeSnapshots: updatedSnapshots,
      positionSnapshot: matchingSnapshot ?? updatedSnapshots[0] ?? null,
      reconciliation: {
        status: "ok",
        message:
          orderStatus === "filled" ? "entry_confirmed" : "entry_submitted",
      },
    };
  }
}
