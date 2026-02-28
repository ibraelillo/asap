# Bot-Centric Trading Engine Refactor

## Glossary

- strategy: deterministic decision module emitting trading intents from context
- bot: persisted runtime configuration binding strategy, market, account, and risk
- intent: structured instruction emitted by a strategy (`enter`, `reduce`, `move-stop`, `close`, `hold`)
- position: local lifecycle record of a bot-owned exposure
- order: execution request emitted by the runtime or backtest engine
- fill: realized execution against an order
- run: one live evaluation cycle for a bot
- backtest: historical execution of a bot through the trading engine
- validation: AI or deterministic external confirmation attached to a bot or backtest
- reconciliation: comparison and repair flow between local position ledger and exchange state
