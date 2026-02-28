import useSWR from "swr";
import { Link, Navigate, useParams } from "react-router-dom";
import { Bot, Layers3, TrendingDown, TrendingUp } from "lucide-react";
import { MetricCard } from "../../trade-results/MetricCard";
import { fetchStrategyDetails } from "../../../lib/ranging-api";
import { formatCurrency, formatDateTime } from "../BotUi";
import { StrategySummaryConfigSnapshot } from "../StrategyConfigSnapshot";

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

  const {
    strategy,
    bots,
    recentRuns,
    recentBacktests,
    bestBacktests,
    worstBacktests,
    configVariants,
  } = details;

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
          Strategy
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-100">
          {strategy.label}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-cyan-100">
            {strategy.strategyId}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
            manifest v{strategy.manifestVersion}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-300/90">{strategy.description}</p>
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

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Completed Backtests"
          value={String(strategy.backtests.completed)}
          icon={<Layers3 className="h-5 w-5" />}
        />
        <MetricCard
          label="Best Backtest"
          value={
            bestBacktests[0]
              ? formatCurrency(bestBacktests[0].netPnl)
              : formatCurrency(0)
          }
          tone={(bestBacktests[0]?.netPnl ?? 0) >= 0 ? "positive" : "default"}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <MetricCard
          label="Worst Backtest"
          value={
            worstBacktests[0]
              ? formatCurrency(worstBacktests[0].netPnl)
              : formatCurrency(0)
          }
          tone={(worstBacktests[0]?.netPnl ?? 0) < 0 ? "negative" : "default"}
          icon={<TrendingDown className="h-5 w-5" />}
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
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
          {strategy.configuredVersions.map((version) => (
            <span
              key={`${strategy.strategyId}-${version}`}
              className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-100"
            >
              strategy v{version}
            </span>
          ))}
          {strategy.configuredVersions.length === 0 ? (
            <span className="rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1 text-slate-400">
              No bots are using this strategy yet
            </span>
          ) : null}
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-100">
            Best Backtests
          </h3>
          <p className="text-xs text-slate-400">
            Best completed runs across all bots using this strategy.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {bestBacktests.map((backtest) => (
            <Link
              key={backtest.id}
              to={`/bots/${encodeURIComponent(backtest.botId)}/backtests/${encodeURIComponent(backtest.id)}`}
              className="rounded-xl border border-white/10 bg-slate-950/40 p-4 transition hover:border-cyan-300/25 hover:bg-white/5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {backtest.symbol}
                  </p>
                  <p className="text-xs text-slate-400">{backtest.id}</p>
                </div>
                <span className="text-sm font-medium text-emerald-200">
                  {formatCurrency(backtest.netPnl)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-300">
                <span>WR {(backtest.winRate * 100).toFixed(1)}%</span>
                <span>Trades {backtest.totalTrades}</span>
                <span>DD {(backtest.maxDrawdownPct * 100).toFixed(2)}%</span>
              </div>
            </Link>
          ))}
          {bestBacktests.length === 0 ? (
            <p className="text-sm text-slate-400">No completed backtests yet.</p>
          ) : null}
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-100">
            Config Variants
          </h3>
          <p className="text-xs text-slate-400">
            Parameter sets grouped across backtests so you can see which variants
            are worth promoting.
          </p>
        </div>
        <div className="space-y-4">
          {configVariants.map((variant) => (
            <div
              key={variant.key}
              className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr]">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-slate-100">
                      Variant Snapshot
                    </p>
                    <p className="text-xs text-slate-400">
                      Latest run {formatDateTime(variant.latestCreatedAtMs)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400">Backtests</p>
                      <p className="text-slate-200">{variant.backtestCount}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Completed</p>
                      <p className="text-slate-200">{variant.completedCount}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Avg Net PnL</p>
                      <p
                        className={
                          variant.avgNetPnl >= 0
                            ? "text-emerald-200"
                            : "text-rose-200"
                        }
                      >
                        {formatCurrency(variant.avgNetPnl)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Avg Win Rate</p>
                      <p className="text-slate-200">
                        {(variant.avgWinRate * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  {variant.sampleBacktestId ? (
                    <Link
                      to={`/bots/${encodeURIComponent(
                        bestBacktests.find(
                          (backtest) =>
                            backtest.id === variant.sampleBacktestId,
                        )?.botId ??
                          recentBacktests.find(
                            (backtest) =>
                              backtest.id === variant.sampleBacktestId,
                          )?.botId ??
                          bots[0]?.botId ??
                          ""
                      )}/backtests/${encodeURIComponent(variant.sampleBacktestId)}`}
                      className="inline-flex rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-400/20"
                    >
                      Open Sample Backtest
                    </Link>
                  ) : null}
                </div>
                <StrategySummaryConfigSnapshot
                  strategy={strategy}
                  config={variant.strategyConfig}
                  emptyMessage="No saved config for this variant."
                />
              </div>
            </div>
          ))}
          {configVariants.length === 0 ? (
            <p className="text-sm text-slate-400">
              No backtest variants have been recorded yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-100">
            Recent Backtests
          </h3>
          <p className="text-xs text-slate-400">
            Latest backtests across every bot using this strategy.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">Created</th>
                <th className="pb-3 pr-4">Bot</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Trades</th>
                <th className="pb-3 pr-4">Win Rate</th>
                <th className="pb-3">Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {recentBacktests.map((backtest) => (
                <tr
                  key={backtest.id}
                  className="border-t border-white/5 text-slate-200"
                >
                  <td className="py-3 pr-4 text-xs text-slate-300">
                    <Link
                      to={`/bots/${encodeURIComponent(
                        backtest.botId,
                      )}/backtests/${encodeURIComponent(backtest.id)}`}
                      className="text-cyan-200 transition hover:text-cyan-100"
                    >
                      {formatDateTime(backtest.createdAtMs)}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-300">
                    {backtest.symbol}
                  </td>
                  <td className="py-3 pr-4">{backtest.status}</td>
                  <td className="py-3 pr-4">{backtest.totalTrades}</td>
                  <td className="py-3 pr-4">
                    {(backtest.winRate * 100).toFixed(1)}%
                  </td>
                  <td className="py-3">
                    <span
                      className={
                        backtest.netPnl >= 0
                          ? "text-emerald-200"
                          : "text-rose-200"
                      }
                    >
                      {formatCurrency(backtest.netPnl)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
