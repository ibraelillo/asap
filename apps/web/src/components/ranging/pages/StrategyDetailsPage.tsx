import useSWR from "swr";
import { Link, Navigate, useParams } from "react-router-dom";
import { Bot, Layers3, TrendingUp } from "lucide-react";
import { MetricCard } from "../../trade-results/MetricCard";
import { fetchStrategyDetails } from "../../../lib/ranging-api";
import { formatDateTime } from "../BotUi";

export function StrategyDetailsPage() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const {
    data: details,
    error,
    isLoading,
  } = useSWR(
    strategyId ? ["strategy-details", strategyId, 24] : null,
    ([, id, windowHours]) =>
      fetchStrategyDetails(String(id), Number(windowHours)),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  if (!strategyId) {
    return <Navigate to="/strategies" replace />;
  }

  if (!details && isLoading) {
    return (
      <div className="panel p-6 text-sm text-slate-300">
        Loading strategy...
      </div>
    );
  }

  if (!details || error) {
    return (
      <div className="panel p-6">
        <p className="text-sm text-rose-300">
          Failed to load strategy details.
        </p>
        <p className="mt-2 text-xs text-slate-400 mono">
          {error instanceof Error ? error.message : "Unknown API error"}
        </p>
      </div>
    );
  }

  const { strategy, bots, recentRuns } = details;

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
          Strategy
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-100">
          {strategyId}
        </h1>
        <p className="mt-2 text-sm text-slate-300/90">
          Bot membership and latest runtime activity for this strategy family.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Bots Using Strategy"
          value={String(strategy.configuredBots)}
          icon={<Bot className="h-5 w-5" />}
        />
        <MetricCard
          label="Recent Runs"
          value={String(recentRuns.length)}
          icon={<Layers3 className="h-5 w-5" />}
        />
        <MetricCard
          label="Active Bots"
          value={String(strategy.activeBots)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </section>

      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Bots</h3>
            <p className="text-xs text-slate-400">
              Bots currently configured with this strategy.
            </p>
          </div>
          <Link
            to={`/bots/create?strategyId=${encodeURIComponent(strategyId)}`}
            className="rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-400/20"
          >
            Create Bot From Strategy
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {bots.map((bot) => (
            <Link
              key={bot.botId}
              to={`/bots/${encodeURIComponent(bot.botId)}`}
              className="rounded-xl border border-white/10 bg-slate-950/40 p-4 transition hover:border-cyan-300/25 hover:bg-white/5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-100">
                    {bot.symbol}
                  </p>
                  <p className="text-xs text-slate-400">
                    {bot.exchangeId} / {bot.accountId}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  {bot.runStatus}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-300">
                Last update: {formatDateTime(bot.generatedAtMs)}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <h3 className="text-lg font-semibold text-slate-100">Strategy Stats</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Net PnL"
            value={`$${strategy.strategy.netPnl.toFixed(2)}`}
            tone={strategy.strategy.netPnl >= 0 ? "positive" : "negative"}
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <MetricCard
            label="Win Rate"
            value={`${(strategy.strategy.winRate * 100).toFixed(1)}%`}
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <MetricCard
            label="Backtests"
            value={String(strategy.backtests.total)}
            icon={<Layers3 className="h-5 w-5" />}
          />
          <MetricCard
            label="Open Positions"
            value={String(strategy.positions.openPositions)}
            icon={<Bot className="h-5 w-5" />}
          />
        </div>
      </section>
    </div>
  );
}
