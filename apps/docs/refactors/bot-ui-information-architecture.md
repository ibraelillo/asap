# Bot UI Information Architecture Refactor

## Current Problems

- `apps/web/src/components/RangingControlCenter.tsx` is acting as a manual router.
- `apps/web/src/components/ranging/BotsPage.tsx` mixes:
  - bots directory
  - bot detail
  - bot stats
  - backtest creation
  - validation creation
  - backtest history
  - validation history
- `/bots` and `/bots/:id` share one component with conditional state. This makes state ownership unclear and keeps URL structure weaker than the data model.
- Strategy is present in the backend model, but there is no strategy-first navigation in the UI.

## Target Navigation

Canonical routes:

- `/results`
- `/strategies`
- `/strategies/:strategyId`
- `/bots`
- `/bots/create`
- `/bots/:botId`
- `/bots/:botId/backtests`
- `/bots/:botId/backtests/:backtestId`
- `/bots/:botId/positions`
- `/bots/:botId/analysis`

Compatibility routes can remain temporarily for old ranging flows, but the web app should navigate only through the canonical paths above.

## Resource Ownership

### Strategies

`/strategies`
- list available strategies
- summary cards per strategy
- number of bots using each strategy
- aggregate stats per strategy

`/strategies/:strategyId`
- strategy metadata and version
- aggregate stats for all bots using it
- bot list filtered to that strategy
- shortcuts to create a bot from this strategy

### Bots

`/bots`
- bot directory only
- search/filter by strategy, exchange, account, symbol, status
- no inline backtest creation
- no validations table

`/bots/create`
- creation form only
- strategy selection first
- then exchange/account/symbol/runtime/risk fields

`/bots/:botId`
- bot overview only
- latest signal state
- operational stats
- performance stats
- current position state
- recent runs
- compact links to:
  - backtests
  - positions
  - analysis

`/bots/:botId/backtests`
- backtest creation form
- backtest list/history
- async status/progress

`/bots/:botId/backtests/:backtestId`
- single backtest replay and diagnostics

## Page Split Required

Split the current `BotsPage` into focused screens/components:

- `StrategiesPage`
- `StrategyDetailsPage`
- `BotsIndexPage`
- `BotCreatePage`
- `BotDetailsPage`
- `BotBacktestsPage`
- `BacktestDetailsPage`
- `BotPositionsPage`

Shared child sections can remain reusable:

- `BotSummaryCard`
- `BotStatsPanel`
- `BotLatestRunPanel`
- `BacktestTable`
- `ValidationTable`
- `ReasonBadges`

## Routing Refactor

Replace manual pathname parsing with `react-router-dom` resource routes.

Required changes:

1. Replace `RangingControlCenter` manual `parseRoute()` logic with router definitions.
2. Keep top-level shell/nav in one layout component.
3. Move data loading closer to route pages instead of keeping one global dashboard object as the only source.
4. Keep the results page independent from bot detail state.

## Data Loading Rules

- Global dashboard data is valid for `/results`.
- Bot pages should fetch by `botId`.
- Strategy pages should fetch by `strategyId`.
- Backtest pages should fetch by `backtestId`.
- Do not use selected bot state in memory as a substitute for route identity.

## Proposed Implementation Order

1. Remove stale tests and obsolete orchestrator references.
2. Introduce real app routes with a shell layout.
3. Extract `BotsIndexPage` from current `BotsPage`.
4. Extract `BotDetailsPage` from current focused-bot mode.
5. Move backtest creation/listing to `BotBacktestsPage`.
6. Introduce `/strategies` and `/strategies/:strategyId`.
7. Add `/bots/create`.

## Acceptance Criteria

- `/bots` shows only the bots directory.
- `/bots/:botId` contains no symbol selector and no multi-bot state.
- `/bots/:botId/backtests` owns backtest creation and history.
- `/bots/:botId/backtests/:backtestId` always links back to the correct bot.
- `/strategies/:strategyId` shows aggregate stats and bot membership for that strategy.
- No component needs to parse URLs manually to determine active resource state.
