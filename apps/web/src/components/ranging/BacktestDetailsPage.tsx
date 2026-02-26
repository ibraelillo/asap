import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, CalendarRange, TrendingDown, TrendingUp } from "lucide-react";
import { fetchBacktestDetails } from "../../lib/ranging-api";
import { MetricCard } from "../trade-results/MetricCard";
import { BacktestReplayChart } from "./BacktestReplayChart";

interface BacktestDetailsPageProps {
  symbol: string;
  backtestId: string;
  onBack?: () => void;
}

type ChartTimeframe = "15m" | "1h" | "2h" | "4h" | "1d";

function formatDateTime(value?: number): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function BacktestDetailsPage({
  symbol,
  backtestId,
  onBack,
}: BacktestDetailsPageProps) {
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("4h");

  const {
    data: details,
    isLoading,
    error,
  } = useSWR(
    ["backtest-details", backtestId, chartTimeframe],
    ([, id, tf]) => fetchBacktestDetails(String(id), String(tf)),
    {
      revalidateOnFocus: false,
    },
  );

  const bestTrade = useMemo(() => {
    if (!details) return undefined;
    return [...details.trades].sort((a, b) => b.netPnl - a.netPnl)[0];
  }, [details]);

  const worstTrade = useMemo(() => {
    if (!details) return undefined;
    return [...details.trades].sort((a, b) => a.netPnl - b.netPnl)[0];
  }, [details]);

  if (isLoading && !details) {
    return (
      <div className="panel p-6">
        <p className="text-sm text-slate-300">Loading backtest replay...</p>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="panel p-6">
        <p className="text-sm text-rose-300">Failed to load backtest details.</p>
        <p className="mt-2 text-xs text-slate-400 mono">
          {error instanceof Error ? error.message : "Unknown API error"}
        </p>
      </div>
    );
  }

  const { backtest } = details;

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Backtest</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              {symbol} Replay
            </h1>
            <p className="mt-2 text-sm text-slate-300/90">
              {formatDateTime(backtest.fromMs)} - {formatDateTime(backtest.toMs)}
            </p>
            <p className="mt-2 text-xs text-slate-400 mono">ID: {backtest.id}</p>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200">
              Chart TF
              <select
                value={chartTimeframe}
                onChange={(event) => setChartTimeframe(event.target.value as ChartTimeframe)}
                className="bg-transparent outline-none"
              >
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="2h">2h</option>
                <option value="4h">4h</option>
                <option value="1d">1d</option>
              </select>
            </label>

            <button
              onClick={() => onBack?.()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Back To Bots
            </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Net PnL"
          value={formatCurrency(backtest.netPnl)}
          tone={backtest.netPnl >= 0 ? "positive" : "negative"}
          icon={<TrendingUp className="h-5 w-5" />}
          hint={`${backtest.totalTrades} trades`}
        />
        <MetricCard
          label="Ending Equity"
          value={formatCurrency(backtest.endingEquity)}
          tone={backtest.endingEquity >= backtest.initialEquity ? "positive" : "negative"}
          icon={<CalendarRange className="h-5 w-5" />}
          hint={`Start ${formatCurrency(backtest.initialEquity)}`}
        />
        <MetricCard
          label="Win Rate"
          value={`${(backtest.winRate * 100).toFixed(1)}%`}
          tone={backtest.winRate >= 0.5 ? "positive" : "negative"}
          icon={<TrendingUp className="h-5 w-5" />}
          hint={`${backtest.wins} wins / ${backtest.losses} losses`}
        />
        <MetricCard
          label="Max Drawdown"
          value={`${(backtest.maxDrawdownPct * 100).toFixed(2)}%`}
          tone={backtest.maxDrawdownPct > 0.2 ? "negative" : "neutral"}
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <MetricCard
          label="Chart Candles"
          value={String(details.candles.length)}
          icon={<CalendarRange className="h-5 w-5" />}
          hint={`TF ${details.chartTimeframe}`}
        />
      </section>

      {details.replayError ? (
        <div className="panel border border-amber-300/25 bg-amber-400/10 p-4">
          <p className="text-sm text-amber-100">Replay warning: {details.replayError}</p>
          <p className="mt-1 text-xs text-amber-200/90">
            Summary metrics are still shown from the stored backtest record.
          </p>
        </div>
      ) : null}

      <BacktestReplayChart details={details} />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="panel p-4">
          <h3 className="text-sm font-semibold text-slate-100">Best Trade</h3>
          {bestTrade ? (
            <p className="mt-2 text-sm text-emerald-300">
              #{bestTrade.id} {bestTrade.side} {formatCurrency(bestTrade.netPnl)}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No trades available.</p>
          )}
        </div>
        <div className="panel p-4">
          <h3 className="text-sm font-semibold text-slate-100">Worst Trade</h3>
          {worstTrade ? (
            <p className="mt-2 text-sm text-rose-300">
              #{worstTrade.id} {worstTrade.side} {formatCurrency(worstTrade.netPnl)}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No trades available.</p>
          )}
        </div>
      </section>

      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Trades</h3>
            <p className="text-xs text-slate-400">All simulated entries and exits in this backtest</p>
          </div>
          <p className="text-xs text-slate-400">{details.trades.length} trades</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">ID</th>
                <th className="pb-3 pr-4">Side</th>
                <th className="pb-3 pr-4">Entry</th>
                <th className="pb-3 pr-4">Close</th>
                <th className="pb-3 pr-4">Qty</th>
                <th className="pb-3 pr-4">Exits</th>
                <th className="pb-3 pr-4">Range @ Entry</th>
                <th className="pb-3">Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {details.trades.map((trade) => (
                <tr key={trade.id} className="border-t border-white/5 text-slate-200">
                  <td className="py-3 pr-4">#{trade.id}</td>
                  <td className={`py-3 pr-4 ${trade.side === "long" ? "text-emerald-300" : "text-amber-300"}`}>
                    {trade.side}
                  </td>
                  <td className="py-3 pr-4 text-xs">
                    {formatDateTime(trade.entryTime)} @ {trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 pr-4 text-xs">
                    {formatDateTime(trade.closeTime)} @ {trade.closePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 pr-4 text-xs">{trade.quantity.toFixed(6)}</td>
                  <td className="py-3 pr-4 text-xs text-slate-300">
                    {trade.exits.map((exit) => `${exit.reason.toUpperCase()} @ ${exit.price.toFixed(2)}`).join(" | ")}
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-300">
                    {trade.rangeLevels
                      ? `VAL ${trade.rangeLevels.val.toFixed(2)} | POC ${trade.rangeLevels.poc.toFixed(2)} | VAH ${trade.rangeLevels.vah.toFixed(2)}`
                      : "-"}
                  </td>
                  <td className={`py-3 font-medium ${trade.netPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {formatCurrency(trade.netPnl)}
                  </td>
                </tr>
              ))}
              {details.trades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-xs text-slate-400">
                    No trades generated for this backtest.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
