# DynamoDB Table Schema

## Table Structure

The Bots table uses a single-table design pattern with the following keys:

- **PK** (Partition Key): Primary identifier
- **SK** (Sort Key): Item type or sub-identifier
- **GSI1PK**: Symbol for querying by trading pair
- **GSI1SK**: Position side (LONG/SHORT)
- **GSI2PK**: Enabled status ("true"/"false")
- **GSI2SK**: Timestamp for sorting

## Item Types

### 1. Bot Configuration (CONFIG)

Stores bot trading parameters and settings.

```json
{
  "PK": "BOT#BTCUSDTM#LONG",
  "SK": "CONFIG",
  "GSI1PK": "BTCUSDTM",
  "GSI1SK": "LONG",
  "GSI2PK": "true",
  "GSI2SK": "2024-01-15T10:30:00.000Z",

  "symbol": "BTCUSDTM",
  "positionSide": "LONG",
  "enabled": true,

  "equity": {
    "percentage": 1,
    "maxLeverage": 20
  },

  "takeProfit": {
    "percentage": 2.5
  },

  "securityOrder": {
    "distancePercentage": 0.75,
    "sizeMultiplier": 1.05
  },

  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Fields:**

- `symbol`: Trading pair (e.g., "BTCUSDTM")
- `positionSide`: "LONG" or "SHORT"
- `enabled`: Boolean flag for active/inactive
- `equity.percentage`: Percentage of account equity to use (1 = 1%)
- `equity.maxLeverage`: Maximum leverage to apply
- `takeProfit.percentage`: Take profit percentage from entry
- `securityOrder.distancePercentage`: Distance from entry for safety order (0.75 = 0.75%)
- `securityOrder.sizeMultiplier`: Size multiplier for safety order (1.05 = 5% larger)

### 2. Bot State (STATE)

Tracks current bot execution state.

```json
{
  "PK": "BOT#BTCUSDTM#LONG",
  "SK": "STATE",

  "status": "ACTIVE",
  "currentPosition": {
    "entryPrice": "45000.50",
    "size": "0.1",
    "leverage": "20",
    "unrealizedPnl": "125.50"
  },

  "orders": {
    "entry": "order-123",
    "takeProfit": "order-456",
    "security": "order-789"
  },

  "lastUpdate": "2024-01-15T10:35:00.000Z"
}
```

**Fields:**

- `status`: "IDLE", "ACTIVE", "CLOSING", "ERROR"
- `currentPosition`: Current position details from KuCoin
- `orders`: Order IDs for tracking
- `lastUpdate`: Last state update timestamp

### 3. Order Record (ORDER)

Historical order records for analytics.

```json
{
  "PK": "BOT#BTCUSDTM#LONG",
  "SK": "ORDER#order-123",

  "orderId": "order-123",
  "type": "ENTRY",
  "side": "BUY",
  "price": "45000.50",
  "size": "0.1",
  "status": "FILLED",
  "filledAt": "2024-01-15T10:35:00.000Z"
}
```

## Access Patterns

### 1. Get Bot Configuration

```typescript
// Query by PK and SK
const params = {
  TableName: "Bots",
  Key: {
    PK: "BOT#BTCUSDTM#LONG",
    SK: "CONFIG",
  },
};
```

### 2. Get All Bots for a Symbol

```typescript
// Query GSI1 by symbol
const params = {
  TableName: "Bots",
  IndexName: "GSI1",
  KeyConditionExpression: "GSI1PK = :symbol",
  ExpressionAttributeValues: {
    ":symbol": "BTCUSDTM",
  },
};
// Returns: Both LONG and SHORT bots for BTCUSDTM
```

### 3. Get All Enabled Bots

```typescript
// Query GSI2 by enabled status
const params = {
  TableName: "Bots",
  IndexName: "GSI2",
  KeyConditionExpression: "GSI2PK = :enabled",
  ExpressionAttributeValues: {
    ":enabled": "true",
  },
};
// Returns: All enabled bot configs across all symbols
```

### 4. Get Bot State

```typescript
// Query by PK and SK
const params = {
  TableName: "Bots",
  Key: {
    PK: "BOT#BTCUSDTM#LONG",
    SK: "STATE",
  },
};
```

### 5. Get All Orders for a Bot

```typescript
// Query by PK with SK begins_with
const params = {
  TableName: "Bots",
  KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
  ExpressionAttributeValues: {
    ":pk": "BOT#BTCUSDTM#LONG",
    ":sk": "ORDER#",
  },
};
```

## Example: Creating a New Bot

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const config = {
  PK: "BOT#BTCUSDTM#LONG",
  SK: "CONFIG",
  GSI1PK: "BTCUSDTM",
  GSI1SK: "LONG",
  GSI2PK: "true",
  GSI2SK: new Date().toISOString(),

  symbol: "BTCUSDTM",
  positionSide: "LONG",
  enabled: true,

  equity: {
    percentage: 1,
    maxLeverage: 20,
  },

  takeProfit: {
    percentage: 2.5,
  },

  securityOrder: {
    distancePercentage: 0.75,
    sizeMultiplier: 1.05,
  },

  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

await client.send(
  new PutCommand({
    TableName: "Bots",
    Item: config,
  }),
);
```

## Notes

- **PK Format**: `BOT#{symbol}#{side}` ensures unique bot per symbol+side combination
- **SK Format**: `CONFIG`, `STATE`, or `ORDER#{orderId}` allows multiple item types per bot
- **GSI2PK**: String "true"/"false" (not boolean) for DynamoDB compatibility
- **GSI2SK**: Timestamp allows sorting enabled bots by creation/update time
- **Orchestrator Usage**: Queries GSI2 where GSI2PK="true" to find all enabled bots and extract unique symbols
