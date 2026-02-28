import type {
  EquityPoint,
  SymbolBreakdown,
  TradeMetrics,
  TradePayload,
  TradeRecord,
  TradeSide,
} from "../types/trade-results";

const defaultInitialEquity = 10_000;

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSide(value: unknown): TradeSide {
  if (typeof value === "string" && value.toLowerCase() === "short")
    return "short";
  return "long";
}

function normalizeTrade(raw: unknown, index: number): TradeRecord | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Record<string, unknown>;
  const symbol = typeof item.symbol === "string" ? item.symbol : "UNKNOWN";

  const entryTime = toNumber(item.entryTime, Date.now());
  const exitTime = toNumber(item.exitTime, entryTime);

  return {
    id: typeof item.id === "string" ? item.id : `trade-${index + 1}`,
    symbol,
    side: toSide(item.side),
    entryTime,
    exitTime,
    entryPrice: toNumber(item.entryPrice),
    exitPrice: toNumber(item.exitPrice),
    quantity: toNumber(item.quantity),
    netPnl: toNumber(item.netPnl),
    fees: toNumber(item.fees),
    exitReason:
      typeof item.exitReason === "string" ? item.exitReason : undefined,
  };
}

function normalizeTrades(raw: unknown): TradeRecord[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((trade, index) => normalizeTrade(trade, index))
    .filter((trade): trade is TradeRecord => Boolean(trade))
    .sort((a, b) => a.exitTime - b.exitTime);
}

function normalizeEquityCurve(raw: unknown): EquityPoint[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const item = point as Record<string, unknown>;
      const time = toNumber(item.time);
      const equity = toNumber(item.equity);
      if (!Number.isFinite(time) || !Number.isFinite(equity)) return null;
      return { time, equity };
    })
    .filter((point): point is EquityPoint => Boolean(point))
    .sort((a, b) => a.time - b.time);
}

export function buildEquityCurve(
  trades: TradeRecord[],
  initialEquity = defaultInitialEquity,
): EquityPoint[] {
  let equity = initialEquity;

  return trades.map((trade) => {
    equity += trade.netPnl;
    return {
      time: trade.exitTime,
      equity,
    };
  });
}

export function normalizePayload(raw: unknown): TradePayload {
  if (Array.isArray(raw)) {
    const trades = normalizeTrades(raw);
    return {
      source: "array-import",
      initialEquity: defaultInitialEquity,
      trades,
      equityCurve: buildEquityCurve(trades, defaultInitialEquity),
    };
  }

  if (!raw || typeof raw !== "object") {
    return {
      source: "empty",
      initialEquity: defaultInitialEquity,
      trades: [],
      equityCurve: [],
    };
  }

  const obj = raw as Record<string, unknown>;
  const initialEquity = toNumber(obj.initialEquity, defaultInitialEquity);
  const trades = normalizeTrades(obj.trades);
  const equityCurve = normalizeEquityCurve(obj.equityCurve);

  return {
    source: typeof obj.source === "string" ? obj.source : "import",
    generatedAt:
      typeof obj.generatedAt === "string" ? obj.generatedAt : undefined,
    initialEquity,
    trades,
    equityCurve:
      equityCurve.length > 0
        ? equityCurve
        : buildEquityCurve(trades, initialEquity),
  };
}

export function parsePayloadText(text: string): TradePayload {
  const parsed = JSON.parse(text);
  return normalizePayload(parsed);
}

function computeMaxDrawdownPct(curve: EquityPoint[]): number {
  if (curve.length === 0) return 0;

  let peak = curve[0]?.equity ?? 0;
  let maxDrawdown = 0;

  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    if (peak <= 0) continue;

    const drawdown = (peak - point.equity) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return maxDrawdown;
}

export function computeMetrics(payload: TradePayload): TradeMetrics {
  const trades = payload.trades;
  const equityCurve = payload.equityCurve ?? [];
  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl < 0);

  const netPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLossAbs = Math.abs(
    losses.reduce((sum, trade) => sum + trade.netPnl, 0),
  );

  const endingEquity =
    equityCurve.at(-1)?.equity ??
    (payload.initialEquity ?? defaultInitialEquity) + netPnl;

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length === 0 ? 0 : wins.length / trades.length,
    netPnl,
    avgWin: wins.length === 0 ? 0 : grossProfit / wins.length,
    avgLoss: losses.length === 0 ? 0 : grossLossAbs / losses.length,
    profitFactor: grossLossAbs === 0 ? grossProfit : grossProfit / grossLossAbs,
    maxDrawdownPct: computeMaxDrawdownPct(equityCurve),
    endingEquity,
  };
}

export function computeSymbolBreakdown(
  trades: TradeRecord[],
): SymbolBreakdown[] {
  const map = new Map<string, SymbolBreakdown>();

  for (const trade of trades) {
    const current = map.get(trade.symbol) ?? {
      symbol: trade.symbol,
      trades: 0,
      wins: 0,
      winRate: 0,
      netPnl: 0,
    };

    current.trades += 1;
    if (trade.netPnl > 0) current.wins += 1;
    current.netPnl += trade.netPnl;
    current.winRate = current.trades === 0 ? 0 : current.wins / current.trades;

    map.set(trade.symbol, current);
  }

  return [...map.values()].sort((a, b) => b.netPnl - a.netPnl);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
