import type {
  BotDefinition,
  Candle,
  PositionState,
  StrategyDecision,
  Timeframe,
} from "./types";

export interface ExchangeAccountAuth {
  [key: string]: string | undefined;
}

export interface ExchangeAccount<
  TAuth extends ExchangeAccountAuth = ExchangeAccountAuth,
> {
  id: string;
  name: string;
  exchangeId: string;
  status: "active" | "paused" | "archived";
  auth: TAuth;
  metadata?: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AccountResolver<
  TAccount extends ExchangeAccount = ExchangeAccount,
> {
  getAccount(accountId: string, exchangeId?: string): Promise<TAccount | null>;
  requireAccount(accountId: string, exchangeId?: string): Promise<TAccount>;
  listAccounts?(exchangeId?: string): Promise<TAccount[]>;
}

export interface ExecutionContext<
  TAccount extends ExchangeAccount = ExchangeAccount,
> {
  bot: BotDefinition;
  account: TAccount;
  exchangeId: string;
  nowMs: number;
  dryRun: boolean;
  metadata?: Record<string, unknown>;
}

export interface PublicMarketDataContext {
  exchangeId: string;
  nowMs: number;
  metadata?: Record<string, unknown>;
}

export interface KlineQuery {
  symbol: string;
  timeframe: Timeframe;
  limit: number;
  endTimeMs?: number;
}

export interface ExchangeKlineProvider {
  fetchKlines(query: KlineQuery): Promise<Candle[]>;
}

export interface ExchangePositionReader {
  getOpenPositions(symbol: string): Promise<ExchangePositionSnapshot[]>;
}

export interface ExchangeAccountBalanceSnapshot {
  currency: string;
  available: number;
  total: number;
  raw?: Record<string, unknown>;
}

export interface ExchangeAccountBalanceReader {
  getBalance(currency?: string): Promise<ExchangeAccountBalanceSnapshot>;
}

export interface ExchangeSymbolSummary {
  symbol: string;
  baseCurrency?: string;
  quoteCurrency?: string;
  status?: string;
  maxLeverage?: number;
  supportCross?: boolean;
  raw?: Record<string, unknown>;
}

export interface ExchangeSymbolReader {
  listSymbols(): Promise<ExchangeSymbolSummary[]>;
}

export interface ExchangePositionSnapshot {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  avgEntryPrice?: number;
  isOpen: boolean;
  raw?: Record<string, unknown>;
}

export type ExchangeOrderPurpose =
  | "entry"
  | "reduce"
  | "stop"
  | "take-profit"
  | "close"
  | "reconcile";

export interface ExchangeOrderExecution {
  purpose: ExchangeOrderPurpose;
  status: "submitted" | "filled" | "canceled" | "rejected";
  requestedPrice?: number;
  requestedQuantity?: number;
  requestedValueQty?: string;
  executedPrice?: number;
  executedQuantity?: number;
  externalOrderId?: string;
  clientOid?: string;
}

export interface ExchangeReconciliationResult {
  status: "ok" | "drift" | "error";
  message: string;
}

export type SignalProcessingStatus =
  | "no-signal"
  | "skipped-existing-position"
  | "dry-run"
  | "order-submitted"
  | "synced-position"
  | "error";

export interface SignalProcessingResult {
  status: SignalProcessingStatus;
  side?: "long" | "short";
  message?: string;
  orderId?: string;
  clientOid?: string;
  order?: ExchangeOrderExecution;
  positionSnapshot?: ExchangePositionSnapshot | null;
  exchangeSnapshots?: ExchangePositionSnapshot[];
  reconciliation?: ExchangeReconciliationResult;
}

export interface StrategySignalEvent<TSnapshot = unknown, TMeta = unknown> {
  bot: BotDefinition;
  symbol: string;
  generatedAtMs: number;
  decision: StrategyDecision<TMeta>;
  snapshot: TSnapshot;
  position: PositionState | null;
  exchangePosition?: ExchangePositionSnapshot | null;
  processing?: SignalProcessingResult;
}

export interface SignalProcessor<TSnapshot = unknown, TMeta = unknown> {
  process(
    event: StrategySignalEvent<TSnapshot, TMeta>,
  ): Promise<SignalProcessingResult>;
}

export interface PublicMarketDataAdapter {
  readonly id: string;
  createSymbolReader?(context?: PublicMarketDataContext): ExchangeSymbolReader;
  createKlineProvider(context?: PublicMarketDataContext): ExchangeKlineProvider;
}

export interface PrivateExecutionAdapter<
  TAccount extends ExchangeAccount = ExchangeAccount,
> {
  readonly id: string;
  createAccountBalanceReader?(
    context: ExecutionContext<TAccount>,
  ): ExchangeAccountBalanceReader;
  createPositionReader(
    context: ExecutionContext<TAccount>,
  ): ExchangePositionReader;
  createSignalProcessor<TSnapshot = unknown, TMeta = unknown>(
    context: ExecutionContext<TAccount>,
    options?: unknown,
  ): SignalProcessor<TSnapshot, TMeta>;
}

/**
 * @deprecated Prefer using PublicMarketDataAdapter and PrivateExecutionAdapter explicitly.
 */
export type ExchangeAdapter<
  TAccount extends ExchangeAccount = ExchangeAccount,
> = PublicMarketDataAdapter & PrivateExecutionAdapter<TAccount>;
