# @repo/kucoin-events

Event mapping package for KuCoin WebSocket events to application events using Zod schemas and SST event builder.

## Overview

This package provides a type-safe abstraction layer between KuCoin's WebSocket API and your application's event-driven architecture. It handles:

- **Validation**: Zod schemas ensure incoming WebSocket messages are valid
- **Transformation**: Maps KuCoin's 30+ field events to simplified 8-10 field application events
- **Type Safety**: Full TypeScript support with inferred types
- **Publishing**: SST event builders for type-safe EventBridge publishing

## Architecture

```
KuCoin WebSocket → Orchestrator → EventBridge → Lambda Functions
   (raw JSON)      (validate +      (publish)    (process)
                    transform)
```

### Event Flow

1. **Orchestrator** receives WebSocket message from KuCoin
2. **Validate** with `KucoinPositionChangeSchema` or `KucoinOrderChangeSchema`
3. **Publish** to EventBridge using `PositionChanged` or `OrderChanged` builders
4. **Lambda functions** receive simplified events and execute trading logic

## Installation

```bash
pnpm add @repo/events
```

## Usage

### In Orchestrator (WebSocket Handler)

```typescript
import {
  KucoinPositionChangeSchema,
  PositionChanged,
  PositionClosed,
} from "@repo/events";

// WebSocket message handler
websocket.on("message", async (rawMessage) => {
  try {
    // Step 1: Validate incoming message
    const kucoinEvent = KucoinPositionChangeSchema.parse(
      JSON.parse(rawMessage),
    );

    // Step 2: Check if position is closed
    if (!kucoinEvent.data.isOpen) {
      // Publish position closed event
      await PositionClosed.publish({
        symbol: kucoinEvent.data.symbol,
        realisedPnl: kucoinEvent.data.realisedPnl,
        closedAt: kucoinEvent.data.currentTimestamp,
      });
    } else {
      // Publish position change event
      await PositionChanged.publish({
        symbol: kucoinEvent.data.symbol,
        currentQty: kucoinEvent.data.currentQty,
        avgEntryPrice: kucoinEvent.data.avgEntryPrice,
        markPrice: kucoinEvent.data.markPrice,
        unrealisedPnl: kucoinEvent.data.unrealisedPnl,
        realisedPnl: kucoinEvent.data.realisedPnl,
        liquidationPrice: kucoinEvent.data.liquidationPrice,
        leverage: kucoinEvent.data.realLeverage,
        isOpen: kucoinEvent.data.isOpen,
        timestamp: kucoinEvent.data.currentTimestamp,
      });
    }
  } catch (error) {
    // Zod validation error or publishing error
    console.error("Failed to process WebSocket message:", error);
  }
});
```

### In Lambda Handler (Event Processor)

```typescript
import { PositionChangeEvent, PositionClosedEvent } from "@repo/events";
import { EventBridgeEvent } from "aws-lambda";

export const handler = async (
  event: EventBridgeEvent<"position.changed", PositionChangeEvent>,
) => {
  // TypeScript knows the exact shape of event.detail
  const { symbol, currentQty, avgEntryPrice, unrealisedPnl } = event.detail;

  console.log(`Position updated for ${symbol}`);
  console.log(`Size: ${currentQty}, Entry: ${avgEntryPrice}`);
  console.log(`Unrealized PnL: ${unrealisedPnl}`);

  // Execute trading logic
  if (currentQty > 0 && unrealisedPnl > 100) {
    await placeTakeProfitOrder(symbol, avgEntryPrice * 1.02);
  }
};
```

### In SST Config (EventBridge Subscription)

```typescript
import { EventTypes } from "@repo/events";

// Subscribe Lambda to position events
bus.subscribe("Positions", positionFn.arn, {
  pattern: {
    detailType: [EventTypes.POSITION_CHANGE, EventTypes.POSITION_CLOSED],
  },
});

// Subscribe Lambda to order events
bus.subscribe("Orders", orderFn.arn, {
  pattern: {
    detailType: [EventTypes.ORDER_CHANGE],
  },
});
```

## Event Types

### Position Events

#### `position.changed`

Triggered when a position is updated:

- Position opened
- Position size increased/decreased
- Mark price changed (affects unrealized PnL)
- Margin adjusted

**Fields**: symbol, currentQty, avgEntryPrice, markPrice, unrealisedPnl, realisedPnl, liquidationPrice, leverage, isOpen, timestamp

#### `position.closed`

Triggered when a position is fully closed (currentQty = 0).

**Fields**: symbol, realisedPnl, closedAt

### Order Events

#### `order.changed`

Triggered when an order status changes:

- Order placed (status: "open")
- Order partially filled (status: "match")
- Order fully filled (status: "done")
- Order cancelled (status: "done")

**Fields**: orderId, symbol, side, orderType, size, filledSize, price, status, timestamp

### System Events

#### `orchestrator.started`

Triggered when the orchestrator service starts up.
Used to notify Lambda functions that WebSocket connections are ready.

## API Reference

### Schemas

#### `KucoinPositionChangeSchema`

Zod schema for validating KuCoin position change WebSocket messages.
Contains 30+ fields from KuCoin's API.

#### `KucoinOrderChangeSchema`

Zod schema for validating KuCoin order change WebSocket messages.

#### `PositionChangeEventSchema`

Zod schema for simplified position change application events (10 fields).

#### `PositionClosedEventSchema`

Zod schema for position closed application events (3 fields).

#### `OrderChangeEventSchema`

Zod schema for simplified order change application events (9 fields).

### Event Builders

#### `PositionChanged.publish(data)`

Publishes a position change event to EventBridge.
Validates data with `PositionChangeEventSchema` before publishing.

#### `PositionClosed.publish(data)`

Publishes a position closed event to EventBridge.
Validates data with `PositionClosedEventSchema` before publishing.

#### `OrderChanged.publish(data)`

Publishes an order change event to EventBridge.
Validates data with `OrderChangeEventSchema` before publishing.

### Constants

#### `EventTypes`

Object containing all event type constants:

- `POSITION_CHANGE`: "position.change"
- `POSITION_CLOSED`: "position.closed"
- `ORDER_CHANGE`: "orderChange"
- `ORCHESTRATOR_STARTED`: "orchestrator.started"

## Error Handling

### Validation Errors

If a WebSocket message doesn't match the schema, Zod throws a detailed error:

```typescript
try {
  const kucoinEvent = KucoinPositionChangeSchema.parse(rawMessage);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("Validation failed:", error.errors);
    // error.errors contains detailed field-level errors
  }
}
```

### Publishing Errors

If event publishing fails, the builder throws an error:

```typescript
try {
  await PositionChanged.publish(data);
} catch (error) {
  console.error("Failed to publish event:", error);
  // Retry logic or dead letter queue
}
```

## Benefits

### Type Safety

- Full TypeScript support with inferred types
- IDE auto-completion for event fields
- Compile-time error checking

### Runtime Validation

- Zod ensures data integrity before processing
- Catches malformed WebSocket messages early
- Prevents invalid data from reaching Lambda functions

### Decoupling

- Application logic independent of KuCoin API changes
- If KuCoin changes their API, only this package needs updates
- Lambda functions remain unchanged

### Simplification

- KuCoin events: 30+ fields → Application events: 8-10 fields
- Only essential data passed to Lambda functions
- Reduces payload size and processing time

### Maintainability

- Single source of truth for event schemas
- Centralized event type definitions
- Easy to add new event types

## Testing

```bash
pnpm test
```

## License

Private package for internal use.
