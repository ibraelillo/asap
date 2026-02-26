import { useMemo, useState } from "react";
import { Bot, Filter, Signal } from "lucide-react";
import type { DashboardPayload } from "../../types/ranging-dashboard";

interface BotsPageProps {
  data: DashboardPayload | null;
}

function formatDateTime(value?: number): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function BotsPage({ data }: BotsPageProps) {
  const [symbolFilter, setSymbolFilter] = useState<string>("all");

  const bots = data?.bots ?? [];
  const recentRuns = data?.recentRuns ?? [];

  const filteredRuns = useMemo(() => {
    if (symbolFilter === "all") return recentRuns;
    return recentRuns.filter((run) => run.symbol === symbolFilter);
  }, [recentRuns, symbolFilter]);

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Ranging Bot</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">Bots Analysis</h1>
            <p className="mt-2 text-sm text-slate-300/90">Latest state per bot and most recent analysis decisions</p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
            <Filter className="h-4 w-4" />
            <span>{bots.length} configured bots</span>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {bots.map((bot) => {
          const signalTone =
            bot.signal === "long"
              ? "text-emerald-300"
              : bot.signal === "short"
                ? "text-amber-300"
                : "text-slate-300";

          const statusTone =
            bot.runStatus === "failed"
              ? "text-rose-300"
              : bot.runStatus === "idle"
                ? "text-slate-400"
                : "text-emerald-300";

          return (
            <article key={bot.symbol} className="panel p-4">
              <div className="flex items-center justify-between">
                <p className="inline-flex items-center gap-2 font-medium text-slate-100">
                  <Bot className="h-4 w-4 text-cyan-300" />
                  {bot.symbol}
                </p>
                <span className={`text-xs font-medium uppercase tracking-wide ${statusTone}`}>{bot.runStatus}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-300">
                <div>
                  <p className="text-slate-400">Signal</p>
                  <p className={`mt-1 text-sm font-medium ${signalTone}`}>{bot.signal ?? "none"}</p>
                </div>
                <div>
                  <p className="text-slate-400">Processing</p>
                  <p className="mt-1 text-sm font-medium text-slate-200">{bot.processingStatus}</p>
                </div>
                <div>
                  <p className="text-slate-400">Price</p>
                  <p className="mt-1">{bot.price?.toLocaleString() ?? "-"}</p>
                </div>
                <div>
                  <p className="text-slate-400">Updated</p>
                  <p className="mt-1">{formatDateTime(bot.generatedAtMs)}</p>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-white/8 bg-slate-950/45 p-3 text-xs text-slate-300">
                <p>
                  Range: VAL {bot.rangeVal?.toLocaleString() ?? "-"} / POC {bot.rangePoc?.toLocaleString() ?? "-"} / VAH {bot.rangeVah?.toLocaleString() ?? "-"}
                </p>
                <p className="mt-1">Money Flow Slope: {bot.moneyFlowSlope?.toFixed(4) ?? "-"}</p>
                <p className="mt-1">Reasons: {bot.reasons.join(", ")}</p>
              </div>
            </article>
          );
        })}
      </section>

      <div className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Recent Analysis Feed</h3>
            <p className="text-xs text-slate-400">Per-run decision output from the orchestrator</p>
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200">
            <Signal className="h-4 w-4 text-cyan-300" />
            <select
              value={symbolFilter}
              onChange={(event) => setSymbolFilter(event.target.value)}
              className="bg-transparent outline-none"
            >
              <option value="all">All symbols</option>
              {bots.map((bot) => (
                <option key={bot.symbol} value={bot.symbol}>
                  {bot.symbol}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">Time</th>
                <th className="pb-3 pr-4">Symbol</th>
                <th className="pb-3 pr-4">Signal</th>
                <th className="pb-3 pr-4">Processing</th>
                <th className="pb-3 pr-4">Price</th>
                <th className="pb-3">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.slice(0, 160).map((run) => (
                <tr
                  key={`${run.symbol}-${run.generatedAtMs}-${run.recordedAtMs}`}
                  className="border-t border-white/5 text-slate-200"
                >
                  <td className="py-3 pr-4 text-xs text-slate-300">{formatDateTime(run.generatedAtMs)}</td>
                  <td className="py-3 pr-4 font-medium">{run.symbol}</td>
                  <td className="py-3 pr-4">{run.signal ?? "none"}</td>
                  <td className="py-3 pr-4 text-xs text-slate-300">{run.processing.status}</td>
                  <td className="py-3 pr-4">{run.price?.toLocaleString() ?? "-"}</td>
                  <td className="py-3 text-xs text-slate-300">{run.reasons.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
