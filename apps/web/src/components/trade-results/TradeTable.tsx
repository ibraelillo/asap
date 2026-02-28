import { useMemo, useState } from "react";
import { Field, Panel, Select } from "@repo/ui";
import type { TradeRecord } from "../../types/trade-results";
import { formatCurrency, formatDateTime } from "../../lib/trade-results";

interface TradeTableProps {
  trades: TradeRecord[];
}

export function TradeTable({ trades }: TradeTableProps) {
  const [symbolFilter, setSymbolFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<"all" | "long" | "short">("all");

  const symbols = useMemo(() => {
    return [...new Set(trades.map((trade) => trade.symbol))].sort();
  }, [trades]);

  const symbolOptions = useMemo(
    () => [{ value: "all", label: "All Symbols" }, ...symbols.map((symbol) => ({ value: symbol, label: symbol }))],
    [symbols],
  );

  const sideOptions = [
    { value: "all", label: "Both Sides" },
    { value: "long", label: "Long" },
    { value: "short", label: "Short" },
  ] as const;

  const filtered = useMemo(() => {
    return trades.filter((trade) => {
      if (symbolFilter !== "all" && trade.symbol !== symbolFilter) return false;
      if (sideFilter !== "all" && trade.side !== sideFilter) return false;
      return true;
    });
  }, [symbolFilter, sideFilter, trades]);

  return (
    <Panel className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Trades</h3>
          <p className="text-xs text-slate-400">Detailed execution history</p>
        </div>

        <div className="grid min-w-[320px] grid-cols-1 gap-2 sm:grid-cols-2">
          <Field>
            <Select value={symbolFilter} onChange={setSymbolFilter} options={symbolOptions} />
          </Field>
          <Field>
            <Select
              value={sideFilter}
              onChange={(value) => setSideFilter(value as "all" | "long" | "short")}
              options={sideOptions}
            />
          </Field>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-3 pr-4">Symbol</th>
              <th className="pb-3 pr-4">Side</th>
              <th className="pb-3 pr-4">Entry</th>
              <th className="pb-3 pr-4">Exit</th>
              <th className="pb-3 pr-4">Qty</th>
              <th className="pb-3 pr-4">Reason</th>
              <th className="pb-3 text-right">Net PnL</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((trade) => {
              const pnlTone = trade.netPnl >= 0 ? "text-emerald-300" : "text-rose-300";
              const sideBadge = trade.side === "long" ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200";

              return (
                <tr key={trade.id} className="border-t border-white/5 text-slate-200">
                  <td className="py-3 pr-4 font-medium">{trade.symbol}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-1 text-xs ${sideBadge}`}>{trade.side}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <p>{trade.entryPrice.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(trade.entryTime)}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <p>{trade.exitPrice.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(trade.exitTime)}</p>
                  </td>
                  <td className="py-3 pr-4">{trade.quantity}</td>
                  <td className="py-3 pr-4 text-xs text-slate-300">{trade.exitReason ?? "n/a"}</td>
                  <td className={`py-3 text-right font-medium ${pnlTone}`}>{formatCurrency(trade.netPnl)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
