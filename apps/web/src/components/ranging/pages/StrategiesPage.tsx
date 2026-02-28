import useSWR from "swr";
import { Layers3, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { MetricCard } from "../../trade-results/MetricCard";
import { fetchStrategies } from "../../../lib/ranging-api";

export function StrategiesPage() {
  const {
    data: strategies,
    error,
    isLoading,
  } = useSWR(
    ["strategies", 24],
    ([, windowHours]) => fetchStrategies(Number(windowHours)),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  if (!strategies && isLoading) {
    return (
      <div className="panel p-6 text-sm text-slate-300">
        Loading strategies...
      </div>
    );
  }

  if (!strategies || error) {
    return (
      <div className="panel p-6">
        <p className="text-sm text-rose-300">Failed to load strategies.</p>
        <p className="mt-2 text-xs text-slate-400 mono">
          {error instanceof Error ? error.message : "Unknown API error"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
          Trading Engine
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-100">
          Strategies
        </h1>
        <p className="mt-2 text-sm text-slate-300/90">
          Strategy directory with aggregate bot membership and latest runtime
          posture.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Strategies"
          value={String(strategies.length)}
          icon={<Layers3 className="h-5 w-5" />}
        />
        <MetricCard
          label="Configured Bots"
          value={String(
            strategies.reduce(
              (sum, strategy) => sum + strategy.configuredBots,
              0,
            ),
          )}
          icon={<Workflow className="h-5 w-5" />}
        />
        <MetricCard
          label="Recent Runs"
          value={String(
            strategies.reduce(
              (sum, strategy) => sum + strategy.operations.totalRuns,
              0,
            ),
          )}
          icon={<Workflow className="h-5 w-5" />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {strategies.map((strategy) => (
          <Link
            key={strategy.strategyId}
            to={`/strategies/${encodeURIComponent(strategy.strategyId)}`}
            className="panel p-5 transition hover:border-cyan-300/25 hover:bg-white/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-cyan-300/80">
                  Strategy
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-100">
                  {strategy.strategyId}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Versions {strategy.versions.join(", ")}
                </p>
              </div>
              <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
                {strategy.configuredBots} bots
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
              {strategy.symbols.slice(0, 6).map((symbol) => (
                <span
                  key={symbol}
                  className="rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1"
                >
                  {symbol}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
