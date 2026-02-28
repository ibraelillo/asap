import useSWR from "swr";
import {
  Activity,
  ArrowRight,
  Bot,
  History,
  Layers3,
  Shield,
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MetricCard } from "../../trade-results/MetricCard";
import {
  fetchBotDetails,
  fetchBotPositions,
  fetchBotStats,
  fetchRuns,
} from "../../../lib/ranging-api";
import {
  ReasonBadges,
  SectionHeader,
  formatCurrency,
  formatDateTime,
} from "../BotUi";

export function BotDetailsPage() {
  const { botId } = useParams<{ botId: string }>();

  const {
    data: botDetails,
    error: botError,
    isLoading: botLoading,
  } = useSWR(
    botId ? ["bot-details", botId] : null,
    ([, id]) => fetchBotDetails(String(id)),
    { revalidateOnFocus: false },
  );
  const { data: stats } = useSWR(
    botId ? ["bot-stats", botId] : null,
    ([, id]) => fetchBotStats(String(id), 24),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const { data: runs } = useSWR(
    botId ? ["bot-runs", botId] : null,
    ([, id]) => fetchRuns(80, String(id)),
    { refreshInterval: 20_000, revalidateOnFocus: false },
  );
  const { data: positions } = useSWR(
    botId ? ["bot-positions", botId] : null,
    ([, id]) => fetchBotPositions(String(id)),
    { refreshInterval: 20_000, revalidateOnFocus: false },
  );

  if (!botId) {
    return <Navigate to="/bots" replace />;
  }

  if (!botDetails && botLoading) {
    return (
      <div className="panel p-6 text-sm text-slate-300">Loading bot...</div>
    );
  }

  if (!botDetails || botError) {
    return (
      <div className="panel p-6">
        <p className="text-sm text-rose-300">Failed to load bot.</p>
        <p className="mt-2 text-xs text-slate-400 mono">
          {botError instanceof Error ? botError.message : "Unknown API error"}
        </p>
      </div>
    );
  }

  const summary =
    botDetails.summary && "botId" in botDetails.summary
      ? botDetails.summary
      : undefined;
  const openPosition =
    botDetails.openPosition ??
    positions?.find((position) => position.status !== "closed");
  const recentBacktests = botDetails.backtests.slice(0, 6);
  const recentValidations = botDetails.validations.slice(0, 6);

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
              Bot
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              {summary?.symbol ??
                (typeof botDetails.bot.name === "string"
                  ? botDetails.bot.name
                  : botId)}
            </h1>
            <p className="mt-2 text-sm text-slate-300/90">
              {summary?.strategyId ??
                (typeof botDetails.bot.strategyId === "string"
                  ? botDetails.bot.strategyId
                  : "-")}{" "}
              /{" "}
              {summary?.exchangeId ??
                (typeof botDetails.bot.exchangeId === "string"
                  ? botDetails.bot.exchangeId
                  : "-")}{" "}
              /{" "}
              {summary?.accountId ??
                (typeof botDetails.bot.accountId === "string"
                  ? botDetails.bot.accountId
                  : "-")}
            </p>
            <p className="mt-2 text-xs text-slate-400 mono">ID: {botId}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to={`/bots/${encodeURIComponent(botId)}/backtests`}
              className="rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-400/20"
            >
              Open Backtests
            </Link>
            <Link
              to={`/bots/${encodeURIComponent(botId)}/positions`}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
            >
              Positions
            </Link>
            <Link
              to="/bots"
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
            >
              Back To Bots
            </Link>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Runs (24h)"
          value={String(stats?.operations.totalRuns ?? 0)}
          icon={<Activity className="h-5 w-5" />}
        />
        <MetricCard
          label="Signal Rate"
          value={`${((stats?.operations.signalRate ?? 0) * 100).toFixed(1)}%`}
          icon={<Bot className="h-5 w-5" />}
        />
        <MetricCard
          label="Net PnL"
          value={formatCurrency(stats?.strategy.netPnl ?? 0)}
          tone={(stats?.strategy.netPnl ?? 0) >= 0 ? "positive" : "negative"}
          icon={<History className="h-5 w-5" />}
        />
        <MetricCard
          label="Open Positions"
          value={String(stats?.positions.openPositions ?? 0)}
          icon={<Shield className="h-5 w-5" />}
        />
        <MetricCard
          label="Backtests"
          value={String(stats?.backtests.total ?? botDetails.backtests.length)}
          icon={<Layers3 className="h-5 w-5" />}
        />
      </section>

      <section className="panel p-5">
        <SectionHeader
          title="Latest Bot Analysis"
          description="Most recent runtime summary for this bot."
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs text-slate-400">Signal</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              {summary?.signal ?? "none"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs text-slate-400">Processing</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              {summary?.processingStatus ?? "idle"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs text-slate-400">Price</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              {summary?.price?.toLocaleString() ?? "-"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs text-slate-400">Updated</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              {formatDateTime(summary?.generatedAtMs)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs text-slate-400">VAL</p>
            <p className="mt-2 text-sm font-semibold text-slate-100">
              {summary?.rangeVal?.toLocaleString() ?? "-"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs text-slate-400">POC</p>
            <p className="mt-2 text-sm font-semibold text-slate-100">
              {summary?.rangePoc?.toLocaleString() ?? "-"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs text-slate-400">VAH</p>
            <p className="mt-2 text-sm font-semibold text-slate-100">
              {summary?.rangeVah?.toLocaleString() ?? "-"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs text-slate-400">Money Flow Slope</p>
            <p className="mt-2 text-sm font-semibold text-slate-100">
              {summary?.moneyFlowSlope?.toFixed(4) ?? "-"}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <ReasonBadges reasons={summary?.reasons ?? []} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="panel p-5">
          <SectionHeader
            title="Position"
            description="Locally persisted lifecycle state."
          />
          {openPosition ? (
            <div className="grid grid-cols-2 gap-4 text-sm text-slate-200">
              <div>
                <p className="text-xs text-slate-400">Side</p>
                <p className="mt-1">{openPosition.side}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <p className="mt-1">{openPosition.status}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Quantity</p>
                <p className="mt-1">{openPosition.quantity}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Remaining</p>
                <p className="mt-1">{openPosition.remainingQuantity}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Avg Entry</p>
                <p className="mt-1">
                  {openPosition.avgEntryPrice?.toLocaleString() ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Stop</p>
                <p className="mt-1">
                  {openPosition.stopPrice?.toLocaleString() ?? "-"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No open position recorded for this bot.
            </p>
          )}
        </div>

        <div className="panel p-5">
          <SectionHeader
            title="Recent Validations"
            description="Latest AI range validations for this bot."
          />
          <div className="space-y-3">
            {recentValidations.length === 0 ? (
              <p className="text-sm text-slate-400">
                No validations recorded yet.
              </p>
            ) : (
              recentValidations.map((validation) => (
                <div
                  key={validation.id}
                  className="rounded-xl border border-white/10 bg-slate-950/40 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-100">
                      {validation.timeframe}
                    </p>
                    <span className="text-xs text-slate-300">
                      {validation.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateTime(validation.createdAtMs)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <SectionHeader
          title="Recent Backtests"
          description="Latest historical runs for this bot."
          aside={
            <div className="flex gap-2">
              <Link
                to={`/bots/${encodeURIComponent(botId)}/positions`}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
              >
                Positions
              </Link>
              <Link
                to={`/bots/${encodeURIComponent(botId)}/backtests`}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
              >
                View all backtests
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">Created</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Trades</th>
                <th className="pb-3 pr-4">Net PnL</th>
                <th className="pb-3">Open</th>
              </tr>
            </thead>
            <tbody>
              {recentBacktests.map((backtest) => (
                <tr
                  key={backtest.id}
                  className="border-t border-white/5 text-slate-200"
                >
                  <td className="py-3 pr-4 text-xs text-slate-300">
                    {formatDateTime(backtest.createdAtMs)}
                  </td>
                  <td className="py-3 pr-4">{backtest.status}</td>
                  <td className="py-3 pr-4">{backtest.totalTrades}</td>
                  <td className="py-3 pr-4">
                    {formatCurrency(backtest.netPnl)}
                  </td>
                  <td className="py-3">
                    <Link
                      to={`/bots/${encodeURIComponent(botId)}/backtests/${encodeURIComponent(backtest.id)}`}
                      className="text-cyan-200 transition hover:text-cyan-100"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5">
        <SectionHeader
          title="Recent Analysis Feed"
          description="Per-run decision output from the orchestrator."
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">Time</th>
                <th className="pb-3 pr-4">Signal</th>
                <th className="pb-3 pr-4">Processing</th>
                <th className="pb-3 pr-4">Price</th>
                <th className="pb-3">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).slice(0, 80).map((run) => (
                <tr
                  key={run.id}
                  className="border-t border-white/5 text-slate-200"
                >
                  <td className="py-3 pr-4 text-xs text-slate-300">
                    {formatDateTime(run.generatedAtMs)}
                  </td>
                  <td className="py-3 pr-4">{run.signal ?? "none"}</td>
                  <td className="py-3 pr-4 text-xs text-slate-300">
                    {run.processing.status}
                  </td>
                  <td className="py-3 pr-4">
                    {run.price?.toLocaleString() ?? "-"}
                  </td>
                  <td className="py-3 text-xs text-slate-300">
                    {run.reasons.join(", ")}
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
