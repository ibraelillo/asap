import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  CalendarRange,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button, MetricCard, Panel, Select } from "@repo/ui";
import { Link, useNavigate } from "react-router-dom";
import {
  deleteBacktest,
  fetchBotDetails,
  fetchBacktestDetails,
  fetchStrategyDetails,
} from "../../lib/ranging-api";
import type { BacktestRecord, BacktestTrade } from "../../types/ranging-dashboard";
import { BacktestReplayChart } from "./BacktestReplayChart";
import { BacktestConfigDrawer } from "./BacktestConfigDrawer";
import { StrategySummaryConfigSnapshot } from "./StrategyConfigSnapshot";
import { asRecord, configsEqual, mergeConfigDefaults } from "./config-utils";

interface BacktestDetailsPageProps {
  botId: string;
  backtestId: string;
}

type ChartTimeframe = "15m" | "1h" | "2h" | "4h" | "1d";
type TradeBalanceProgression = {
  entryBalance: number;
  closeBalance: number;
};

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

function tradeBalanceKey(trade: BacktestTrade): string {
  return `${trade.id}-${trade.entryTime}-${trade.closeTime}`;
}

function buildTradeBalanceProgression(
  initialEquity: number,
  trades: BacktestTrade[],
): Map<string, TradeBalanceProgression> {
  const progression = new Map<string, TradeBalanceProgression>();

  for (const trade of trades) {
    const realizedBeforeEntry = trades.reduce((accumulator, candidate) => {
      const isClosedBeforeEntry = candidate.closeTime < trade.entryTime;
      const sameCloseTimeBeforeId =
        candidate.closeTime === trade.entryTime && candidate.id < trade.id;
      if (!isClosedBeforeEntry && !sameCloseTimeBeforeId) return accumulator;
      return accumulator + candidate.netPnl;
    }, 0);

    const entryBalance = initialEquity + realizedBeforeEntry;
    progression.set(tradeBalanceKey(trade), {
      entryBalance,
      closeBalance: entryBalance + trade.netPnl,
    });
  }

  return progression;
}

export function BacktestDetailsPage({
  botId,
  backtestId,
}: BacktestDetailsPageProps) {
  const navigate = useNavigate();
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("4h");
  const [rerunOpen, setRerunOpen] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<string>();
  const [deleting, setDeleting] = useState(false);

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
  const { data: strategyDetails } = useSWR(
    details?.backtest.strategyId
      ? ["strategy-details", details.backtest.strategyId]
      : null,
    ([, strategyId]) => fetchStrategyDetails(String(strategyId)),
    { revalidateOnFocus: false },
  );
  const { data: botDetails } = useSWR(
    botId ? ["bot-details", botId] : null,
    ([, id]) => fetchBotDetails(String(id)),
    { revalidateOnFocus: false },
  );

  const bestTrade = useMemo(() => {
    if (!details) return undefined;
    const winners = details.trades.filter((trade) => trade.netPnl > 0);
    return winners.sort((a, b) => b.netPnl - a.netPnl)[0];
  }, [details]);

  const worstTrade = useMemo(() => {
    if (!details) return undefined;
    const losers = details.trades.filter((trade) => trade.netPnl < 0);
    return losers.sort((a, b) => a.netPnl - b.netPnl)[0];
  }, [details]);

  const tradeBalanceProgression = useMemo(() => {
    if (!details) return new Map<string, TradeBalanceProgression>();
    return buildTradeBalanceProgression(
      details.backtest.initialEquity,
      details.trades,
    );
  }, [details]);

  if (isLoading && !details) {
    return (
      <Panel className="p-6">
        <p className="text-sm text-slate-300">Loading backtest replay...</p>
      </Panel>
    );
  }

  if (error || !details) {
    return (
      <Panel className="p-6">
        <p className="text-sm text-rose-300">
          Failed to load backtest details.
        </p>
        <p className="mt-2 text-xs text-slate-400 mono">
          {error instanceof Error ? error.message : "Unknown API error"}
        </p>
      </Panel>
    );
  }

  const { backtest } = details;
  const strategySummary = strategyDetails?.strategy;
  const storedBacktestStrategyConfig = asRecord(backtest.strategyConfig);
  const effectiveBacktestStrategyConfig = mergeConfigDefaults(
    asRecord(strategySummary?.configDefaults),
    storedBacktestStrategyConfig,
  );
  const currentBotStrategyConfig = mergeConfigDefaults(
    asRecord(strategySummary?.configDefaults),
    asRecord(botDetails?.bot.runtime.strategyConfig),
  );
  const hasSnapshot = Object.keys(storedBacktestStrategyConfig).length > 0;
  const isLiveConfig =
    hasSnapshot &&
    configsEqual(effectiveBacktestStrategyConfig, currentBotStrategyConfig);

  async function removeBacktest() {
    if (backtest.status === "running" || deleting) return;
    const confirmed = window.confirm(
      `Remove backtest ${backtest.id}? This only deletes the saved backtest record.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteFeedback(undefined);
    try {
      await deleteBacktest(backtest.id);
      navigate(`/bots/${encodeURIComponent(botId)}/backtests`, {
        replace: true,
      });
    } catch (nextError) {
      setDeleteFeedback(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel as="header" className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
              Backtest
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              {backtest.symbol} Replay
            </h1>
            <p className="mt-2 text-sm text-slate-300/90">
              {formatDateTime(backtest.fromMs)} -{" "}
              {formatDateTime(backtest.toMs)}
            </p>
            <p className="mt-2 text-xs text-slate-400 mono">
              ID: {backtest.id}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-36">
              <Select
                value={chartTimeframe}
                onChange={(value) => setChartTimeframe(value as ChartTimeframe)}
                options={[
                  { value: "15m", label: "15m" },
                  { value: "1h", label: "1h" },
                  { value: "2h", label: "2h" },
                  { value: "4h", label: "4h" },
                  { value: "1d", label: "1d" },
                ]}
              />
            </div>

            <Link
              to={`/bots/${encodeURIComponent(botId)}/backtests`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Back To Backtests
            </Link>
            <Link
              to={`/bots/${encodeURIComponent(botId)}`}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-400/15"
            >
              Bot Overview
            </Link>
            <Button
              size="sm"
              onClick={() => setRerunOpen(true)}
              disabled={!hasSnapshot}
            >
              {hasSnapshot ? "Edit & Rerun" : "No Snapshot"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                void removeBacktest();
              }}
              disabled={backtest.status === "running" || deleting}
              title={
                backtest.status === "running"
                  ? "Running backtests cannot be removed."
                  : "Remove this backtest"
              }
            >
              {deleting ? "Removing..." : "Remove"}
            </Button>
          </div>
        </div>
      </Panel>

      {deleteFeedback ? (
        <Panel className="p-4" tone="danger">
          <p className="text-sm text-rose-100">{deleteFeedback}</p>
        </Panel>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
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
          tone={
            backtest.endingEquity >= backtest.initialEquity
              ? "positive"
              : "negative"
          }
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
        <MetricCard
          label="Execution Mode"
          value={backtest.ai?.enabled ? "AI-integrated" : "Core-only"}
          icon={<TrendingUp className="h-5 w-5" />}
          hint={
            backtest.ai?.enabled
              ? `${backtest.ai.evaluationsAccepted}/${backtest.ai.evaluationsRun} accepted`
              : "No model calls"
          }
        />
      </section>

      <BacktestReplayChart details={details} />

      {details.replayError ? (
        <Panel className="p-4" tone="warning">
          <p className="text-sm text-amber-100">
            Replay warning: {details.replayError}
          </p>
          <p className="mt-1 text-xs text-amber-200/90">
            Summary metrics are still shown from the stored backtest record.
          </p>
        </Panel>
      ) : null}

      <Panel className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">
              Backtest Settings
            </h3>
            <p className="text-xs text-slate-400">
              Persisted settings frozen into this backtest at queue time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isLiveConfig ? (
              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100">
                live
              </span>
            ) : null}
            {hasSnapshot ? null : (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-400">
                no snapshot stored
              </span>
            )}
          </div>
        </div>

        {hasSnapshot ? (
          <>
            <p className="mb-4 text-sm text-slate-400">
              This panel shows the exact settings stored on this backtest.
              Use edit-and-rerun to fork this snapshot, change values, and open
              the new replay immediately.
            </p>
            <StrategySummaryConfigSnapshot
              strategy={strategySummary}
              config={storedBacktestStrategyConfig}
            />
          </>
        ) : (
          <p className="text-sm text-slate-400">
            No strategy snapshot was stored on this backtest.
          </p>
        )}
      </Panel>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel className="p-4">
          <h3 className="text-sm font-semibold text-slate-100">Best Trade</h3>
          {bestTrade ? (
            <p className="mt-2 text-sm text-emerald-300">
              #{bestTrade.id} {bestTrade.side}{" "}
              {formatCurrency(bestTrade.netPnl)}
            </p>
          ) : details.trades.length > 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              No winning trade in this backtest.
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No trades available.</p>
          )}
        </Panel>
        <Panel className="p-4">
          <h3 className="text-sm font-semibold text-slate-100">Worst Trade</h3>
          {worstTrade ? (
            <p className="mt-2 text-sm text-rose-300">
              #{worstTrade.id} {worstTrade.side}{" "}
              {formatCurrency(worstTrade.netPnl)}
            </p>
          ) : details.trades.length > 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              No losing trade in this backtest.
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No trades available.</p>
          )}
        </Panel>
      </section>

      <Panel className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Trades</h3>
            <p className="text-xs text-slate-400">
              All simulated entries and exits in this backtest
            </p>
          </div>
          <p className="text-xs text-slate-400">
            {details.trades.length} trades
          </p>
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
                <th className="pb-3 pr-4">Balance (E -&gt; X)</th>
                <th className="pb-3 pr-4">Exits</th>
                <th className="pb-3 pr-4">Range @ Entry</th>
                <th className="pb-3">Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {details.trades.map((trade) => {
                const balanceKey = tradeBalanceKey(trade);
                const balances = tradeBalanceProgression.get(balanceKey);
                return (
                  <tr
                    key={balanceKey}
                    className="border-t border-white/5 text-slate-200"
                  >
                    <td className="py-3 pr-4">#{trade.id}</td>
                    <td
                      className={`py-3 pr-4 ${trade.side === "long" ? "text-emerald-300" : "text-amber-300"}`}
                    >
                      {trade.side}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {formatDateTime(trade.entryTime)} @{" "}
                      {trade.entryPrice.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {formatDateTime(trade.closeTime)} @{" "}
                      {trade.closePrice.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {trade.quantity.toFixed(6)}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {balances
                        ? `${formatCurrency(balances.entryBalance)} -> ${formatCurrency(balances.closeBalance)}`
                        : "-"}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {trade.exits
                        .map(
                          (exit) =>
                            `${exit.reason.toUpperCase()} @ ${exit.price.toFixed(2)}`,
                        )
                        .join(" | ")}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {trade.rangeLevels
                        ? `VAL ${trade.rangeLevels.val.toFixed(2)} | POC ${trade.rangeLevels.poc.toFixed(2)} | VAH ${trade.rangeLevels.vah.toFixed(2)}`
                        : "-"}
                    </td>
                    <td
                      className={`py-3 font-medium ${trade.netPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      {formatCurrency(trade.netPnl)}
                    </td>
                  </tr>
                );
              })}
              {details.trades.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-4 text-center text-xs text-slate-400"
                  >
                    No trades generated for this backtest.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <BacktestConfigDrawer
        open={rerunOpen}
        onClose={() => setRerunOpen(false)}
        botId={botId}
        symbol={backtest.symbol}
        strategy={strategySummary}
        seedKey={backtest.id}
        seed={{
          strategyConfig: backtest.strategyConfig,
          fromMs: backtest.fromMs,
          toMs: backtest.toMs,
          initialEquity: backtest.initialEquity,
          ai: backtest.ai,
        }}
        title={`Edit ${backtest.id} And Run`}
        description="This drawer is seeded with the configuration used by this backtest. Edit the values, queue a new run, and jump straight to the new replay."
        onCreated={async (nextBacktest: BacktestRecord) => {
          navigate(
            `/bots/${encodeURIComponent(botId)}/backtests/${encodeURIComponent(nextBacktest.id)}`,
          );
        }}
      />
    </div>
  );
}
