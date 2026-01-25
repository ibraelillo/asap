# @repo/bot-config

Shared package for bot configuration management with DynamoDB repository and Zod validation.

## Installation

```bash
pnpm add @repo/bot-config
```

## Usage

### Repository

```typescript
import { BotConfigRepository } from "@repo/bot-config";

const repo = new BotConfigRepository("Bots");

// Get bot configuration
const config = await repo.get("BTCUSDTM", "LONG");

// Create bot configuration
const newConfig = await repo.create({
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
});

// Update bot configuration
const updated = await repo.update({
  symbol: "BTCUSDTM",
  positionSide: "LONG",
  enabled: false,
});

// Delete bot configuration
await repo.delete("BTCUSDTM", "LONG");

// Get all enabled bots
const enabled = await repo.getEnabled();

// Get all bots for a symbol
const bots = await repo.getBySymbol("BTCUSDTM");
```

### Validation

```typescript
import { BotConfigCreateSchema } from "@repo/bot-config";

// Validate input
const result = BotConfigCreateSchema.safeParse(input);
if (!result.success) {
  console.error(result.error);
}
```

## API

### BotConfigRepository

- `get(symbol, positionSide)` - Get bot configuration
- `create(input)` - Create bot configuration
- `update(input)` - Update bot configuration
- `delete(symbol, positionSide)` - Delete bot configuration
- `getEnabled()` - Get all enabled bots
- `getBySymbol(symbol)` - Get all bots for a symbol

### Schemas

- `BotConfigSchema` - Full bot configuration schema
- `BotConfigCreateSchema` - Create input schema
- `BotConfigUpdateSchema` - Update input schema
