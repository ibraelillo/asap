import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Activity,
  Bot,
  Filter,
  History,
  Play,
  Signal,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  createBacktest,
  fetchBacktests,
  fetchBotStats,
} from "../../lib/ranging-api";
import type { DashboardPayload } from "../../types/ranging-dashboard";
import { MetricCard } from "../trade-results/MetricCard";

interface BotsPageProps {
  data: DashboardPayload | null;
  selectedBotSymbol?: string;
  onSelectBotSymbol?: (symbol: string | undefined) => void;
  onOpenBacktest?: (symbol: string, backtestId: string) => void;
}

function formatDateTime(value?: number): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function BotsPage({
  data,
  selectedBotSymbol,
  onSelectBotSymbol,
  onOpenBacktest,
}: BotsPageProps) {
  const [symbolFilter, setSymbolFilter] = useState<string>("all");
  const [backtestSymbol, setBacktestSymbol] = useState<string>("");
  const [backtestPeriodDays, setBacktestPeriodDays] = useState<number>(30);
  const [backtestInitialEquity, setBacktestInitialEquity] = useState<number>(1000);
  const [creatingBacktest, setCreatingBacktest] = useState(false);
  const [backtestFeedback, setBacktestFeedback] = useState<string | undefined>();

  const bots = data?.bots ?? [];
  const recentRuns = data?.recentRuns ?? [];
  const botSymbols = useMemo(() => bots.map((bot) => bot.symbol), [bots]);
  const botSymbolsKey = botSymbols.join("|");
  const firstBotSymbol = botSymbols[0] ?? "";
  const focusedBotSymbol =
    selectedBotSymbol && bots.some((bot) => bot.symbol === selectedBotSymbol)
      ? selectedBotSymbol
      : undefined;
  const backtestScopeSymbol = focusedBotSymbol;
  const visibleBots = focusedBotSymbol
    ? bots.filter((bot) => bot.symbol === focusedBotSymbol)
    : bots;

  const {
    data: botStats,
    mutate: mutateBotStats,
  } = useSWR(
    "ranging-bot-stats",
    () => fetchBotStats(24),
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
    },
  );

  const {
    data: backtests,
    isLoading: backtestsLoading,
    mutate: mutateBacktests,
  } = useSWR(
    ["ranging-backtests", backtestScopeSymbol ?? "all"],
    ([, symbol]) => fetchBacktests(60, symbol === "all" ? undefined : String(symbol)),
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
    },
  );

  useEffect(() => {
    if (focusedBotSymbol) {
      setBacktestSymbol(focusedBotSymbol);
      setSymbolFilter(focusedBotSymbol);
      return;
    }

    if (firstBotSymbol.length === 0) {
      setBacktestSymbol("");
      return;
    }

    if (!backtestSymbol || !botSymbols.includes(backtestSymbol)) {
      setBacktestSymbol(firstBotSymbol);
    }
  }, [backtestSymbol, botSymbolsKey, firstBotSymbol, focusedBotSymbol]);

  const filteredRuns = useMemo(() => {
    if (symbolFilter === "all") return recentRuns;
    return recentRuns.filter((run) => run.symbol === symbolFilter);
  }, [recentRuns, symbolFilter]);

  const completedBacktests = (backtests ?? []).filter((item) => item.status === "completed");
  const latestBacktest = completedBacktests[0];

  function focusBot(symbol: string) {
    setBacktestSymbol(symbol);
    setSymbolFilter(symbol);
    onSelectBotSymbol?.(symbol);
  }

  async function onCreateBacktest() {
    if (!backtestSymbol || creatingBacktest) return;

    setCreatingBacktest(true);
    setBacktestFeedback(undefined);

    try {
      const backtest = await createBacktest({
        symbol: backtestSymbol,
        periodDays: backtestPeriodDays,
        initialEquity: backtestInitialEquity,
      });

      setBacktestFeedback(
        backtest.status === "completed"
          ? `Backtest ready: net ${formatCurrency(backtest.netPnl)} on ${backtest.totalTrades} trades.`
          : `Backtest failed: ${backtest.errorMessage ?? "Unknown error"}`,
      );

      await Promise.all([mutateBacktests(), mutateBotStats()]);
    } catch (error) {
      setBacktestFeedback(
        `Backtest request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setCreatingBacktest(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Ranging Bot</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">Bots Analysis</h1>
            <p className="mt-2 text-sm text-slate-300/90">Latest state per bot and most recent analysis decisions</p>
            {focusedBotSymbol ? (
              <p className="mt-2 text-xs text-cyan-200">
                Focused bot page: <span className="font-medium">{focusedBotSymbol}</span>
              </p>
            ) : null}
          </div>

          <div className="inline-flex items-center gap-2">
            {focusedBotSymbol ? (
              <button
                onClick={() => {
                  setSymbolFilter("all");
                  onSelectBotSymbol?.(undefined);
                }}
                className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-400/15"
              >
                Show all bots
              </button>
            ) : null}
            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
              <Filter className="h-4 w-4" />
              <span>{bots.length} configured bots</span>
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Configured Bots"
          value={String(botStats?.configuredBots ?? bots.length)}
          icon={<Bot className="h-5 w-5" />}
        />
        <MetricCard
          label="Runs (24h)"
          value={String(botStats?.runsInWindow ?? 0)}
          icon={<Activity className="h-5 w-5" />}
        />
        <MetricCard
          label="Signal Rate"
          value={`${((botStats?.signalRate ?? 0) * 100).toFixed(1)}%`}
          tone={(botStats?.signalRate ?? 0) > 0.1 ? "positive" : "neutral"}
          icon={<TrendingUp className="h-5 w-5" />}
          hint={`${botStats?.signalsInWindow ?? 0} signals / 24h`}
        />
        <MetricCard
          label="Failure Rate"
          value={`${((botStats?.failureRate ?? 0) * 100).toFixed(1)}%`}
          tone={(botStats?.failureRate ?? 0) > 0.05 ? "negative" : "positive"}
          icon={<TriangleAlert className="h-5 w-5" />}
          hint={`${botStats?.failuresInWindow ?? 0} failed runs`}
        />
        <MetricCard
          label="Backtests"
          value={String(
            backtestScopeSymbol
              ? (backtests?.length ?? 0)
              : (botStats?.backtests.total ?? (backtests?.length ?? 0)),
          )}
          tone={(
            backtestScopeSymbol
              ? (latestBacktest?.netPnl ?? 0)
              : (botStats?.backtests.latestNetPnl ?? 0)
          ) >= 0 ? "positive" : "negative"}
          icon={<History className="h-5 w-5" />}
          hint={
            latestBacktest
              ? `Latest net ${formatCurrency(latestBacktest.netPnl)}`
              : "No completed backtests yet"
          }
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleBots.map((bot) => {
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
            <article
              key={bot.symbol}
              className={`panel cursor-pointer p-4 transition ${
                focusedBotSymbol === bot.symbol
                  ? "border-cyan-300/35 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]"
                  : "hover:border-cyan-300/20"
              }`}
              onClick={() => focusBot(bot.symbol)}
            >
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
            <h3 className="text-lg font-semibold text-slate-100">Backtests</h3>
            <p className="text-xs text-slate-400">
              Run historical backtests in backend and track performance per bot.
            </p>
          </div>
          {backtestFeedback ? (
            <p className="text-xs text-cyan-200">{backtestFeedback}</p>
          ) : null}
        </div>

        <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-slate-900/45 p-3">
          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            Symbol
            <select
              value={backtestSymbol}
              onChange={(event) => setBacktestSymbol(event.target.value)}
              className="rounded bg-slate-950/60 px-2 py-1 text-slate-100 outline-none"
            >
              {bots.map((bot) => (
                <option key={bot.symbol} value={bot.symbol}>
                  {bot.symbol}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            Period
            <select
              value={backtestPeriodDays}
              onChange={(event) => setBacktestPeriodDays(Number(event.target.value))}
              className="rounded bg-slate-950/60 px-2 py-1 text-slate-100 outline-none"
            >
              <option value={7}>1 week</option>
              <option value={15}>15 days</option>
              <option value={30}>1 month</option>
              <option value={90}>3 months</option>
            </select>
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            Initial Equity
            <input
              type="number"
              min={100}
              value={backtestInitialEquity}
              onChange={(event) => setBacktestInitialEquity(Math.max(100, Number(event.target.value) || 1000))}
              className="w-28 rounded bg-slate-950/60 px-2 py-1 text-right text-slate-100 outline-none"
            />
          </label>

          <button
            onClick={() => {
              void onCreateBacktest();
            }}
            disabled={!backtestSymbol || creatingBacktest}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5" />
            {creatingBacktest ? "Running..." : "Run Backtest"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">Created</th>
                <th className="pb-3 pr-4">Symbol</th>
                <th className="pb-3 pr-4">Window</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Trades</th>
                <th className="pb-3 pr-4">Win Rate</th>
                <th className="pb-3 pr-4">Net PnL</th>
                <th className="pb-3 pr-4">Max DD</th>
                <th className="pb-3">Ending Equity</th>
              </tr>
            </thead>
            <tbody>
              {(backtests ?? []).slice(0, 80).map((backtest) => {
                const statusTone =
                  backtest.status === "completed"
                    ? "text-emerald-300"
                    : "text-rose-300";
                const pnlTone = backtest.netPnl >= 0 ? "text-emerald-300" : "text-rose-300";
                const detailHref = `/bots/${encodeURIComponent(backtest.symbol)}/backtests/${encodeURIComponent(backtest.id)}`;

                return (
                  <tr
                    key={backtest.id}
                    className="cursor-pointer border-t border-white/5 text-slate-200 transition hover:bg-white/5"
                    onClick={() => onOpenBacktest?.(backtest.symbol, backtest.id)}
                  >
                    <td className="py-3 pr-4 text-xs text-cyan-200">
                      <Link
                        to={detailHref}
                        onClick={(event) => event.stopPropagation()}
                        className="underline decoration-cyan-300/40 underline-offset-2 transition hover:text-cyan-100"
                      >
                        {formatDateTime(backtest.createdAtMs)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 font-medium">{backtest.symbol}</td>
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {formatDateTime(backtest.fromMs)} - {formatDateTime(backtest.toMs)}
                    </td>
                    <td className={`py-3 pr-4 text-xs font-medium ${statusTone}`}>{backtest.status}</td>
                    <td className="py-3 pr-4">{backtest.totalTrades}</td>
                    <td className="py-3 pr-4">{(backtest.winRate * 100).toFixed(1)}%</td>
                    <td className={`py-3 pr-4 font-medium ${pnlTone}`}>{formatCurrency(backtest.netPnl)}</td>
                    <td className="py-3 pr-4">{(backtest.maxDrawdownPct * 100).toFixed(2)}%</td>
                    <td className="py-3">{formatCurrency(backtest.endingEquity)}</td>
                  </tr>
                );
              })}
              {backtestsLoading && (backtests?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={9} className="py-4 text-center text-xs text-slate-400">
                    Loading backtests...
                  </td>
                </tr>
              ) : null}
              {!backtestsLoading && (backtests?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={9} className="py-4 text-center text-xs text-slate-400">
                    No backtests yet. Run one from the form above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

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

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
