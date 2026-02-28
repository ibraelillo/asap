# Ranging Bot Orchestrators

Exchange orchestration layer for the exchange-agnostic `@repo/ranging-core` strategy.

Responsibilities:

- fetch klines from specific exchange adapters
- build strategy snapshot via `@repo/ranging-core`
- process emitted signals with exchange-specific handlers

## Architecture

- `@repo/ranging-core`: pure strategy + deterministic backtest (no exchange code).
- `@repo/ranging-bot`: orchestration ports and exchange adapters.

## KuCoin Wiring

- `KucoinKlineProvider`: fetches and normalizes klines.
- `BotRuntimeOrchestrator`: runs fetch -> evaluate -> emit through a strategy/runtime contract.
- `KucoinSignalProcessor`: maps signals to KuCoin orders (or dry-run).

## Real Kline Fixture

Fetch and freeze the latest 3 months of KuCoin futures klines:

```bash
pnpm --filter @repo/ranging-bot fetch:kucoin-klines
```

Script: `scripts/fetch-kucoin-klines.mjs`

Optional flags:

- `--symbol=XBTUSDTM`
- `--granularity=60`
- `--months=3`
- `--out=packages/ranging-core/tests/fixtures/kucoin-futures-XBTUSDTM-1h-last-3months.json`

## AWS Scheduler Runtime (Low Cost)

The stack now runs the bot continuously using a single scheduled Lambda:

- schedule: `rate(1 minute)` (configurable via `RANGING_SCHEDULE`)
- reconciliation loop: `rate(5 minutes)` (configurable via `RANGING_RECONCILIATION_SCHEDULE`)
- no VPC/NAT/ECS required
- one function tick handles all configured symbols

Required env vars for deploy:

- `KUCOIN_API_KEY`
- `KUCOIN_API_SECRET`
- `KUCOIN_API_PASSPHRASE`

Local setup:

```bash
cp .env.example .env
```

Bot runtime config:

- `RANGING_BOTS_JSON` (JSON array)
- `RANGING_DRY_RUN` (`true`/`false`)
- `RANGING_MARGIN_MODE` (`CROSS`/`ISOLATED`)
- `RANGING_VALUE_QTY` (order notional, string)

Example `RANGING_BOTS_JSON`:

```json
[
  {
    "symbol": "XBTUSDTM",
    "executionTimeframe": "15m",
    "primaryRangeTimeframe": "1d",
    "secondaryRangeTimeframe": "4h",
    "executionLimit": 240,
    "primaryRangeLimit": 90,
    "secondaryRangeLimit": 180,
    "enabled": true
  }
]
```
