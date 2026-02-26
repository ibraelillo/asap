import type { SymbolBreakdown } from "../../types/trade-results";
import { formatCurrency, formatPercent } from "../../lib/trade-results";

interface SymbolBreakdownProps {
  rows: SymbolBreakdown[];
}

export function SymbolBreakdownGrid({ rows }: SymbolBreakdownProps) {
  if (rows.length === 0) {
    return (
      <div className="panel p-5">
        <h3 className="text-lg font-semibold text-slate-100">Symbol Breakdown</h3>
        <p className="mt-3 text-sm text-slate-400">No trades available</p>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <h3 className="text-lg font-semibold text-slate-100">Symbol Breakdown</h3>
      <p className="mb-4 mt-1 text-xs text-slate-400">Top and worst symbols by net PnL</p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const tone = row.netPnl >= 0 ? "text-emerald-300" : "text-rose-300";
          const accent = row.netPnl >= 0 ? "bg-emerald-400/60" : "bg-rose-400/60";

          return (
            <div key={row.symbol} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-100">{row.symbol}</p>
                <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
              </div>

              <p className={`mt-2 text-lg font-semibold ${tone}`}>{formatCurrency(row.netPnl)}</p>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>{row.trades} trades</span>
                <span>{formatPercent(row.winRate)} win rate</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
