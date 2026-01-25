# Orchestrator

WebSocket orchestrator for KuCoin trading bot system.

## Local Development

### Option 1: Direct (with SST)

```bash
# Run with SST shell (auto-injects resources)
pnpm dev

# Or run directly with local env
cp .env.example .env
# Fill in .env with your credentials
pnpm dev:local
```

### Option 2: Docker Compose

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# 2. Build and run
pnpm docker:build
pnpm docker:up

# 3. View logs
pnpm docker:logs

# 4. Stop
pnpm docker:down
```

## Endpoints

- `GET /health` - Health check with WebSocket status
- `POST /events` - Receive EventBridge events

## Architecture

The orchestrator:

1. Connects to KuCoin WebSocket (positions + orders)
2. Forwards all events to EventBridge
3. Receives EventBridge events via HTTP
4. Runs 24/7 in Fargate (production) or Docker (local)

## Environment Variables

- `KUCOIN_API_KEY` - KuCoin API key
- `KUCOIN_API_SECRET` - KuCoin API secret
- `KUCOIN_PASSPHRASE` - KuCoin passphrase
- `EVENT_BUS_NAME` - EventBridge bus name
- `TABLE_NAME` - DynamoDB table name
- `AWS_REGION` - AWS region
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
