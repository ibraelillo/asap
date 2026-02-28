import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  CalendarRange,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button, Drawer, MetricCard, Panel, Select } from "@repo/ui";
import { Link } from "react-router-dom";
import {
  fetchBacktestDetails,
  fetchBotDetails,
  fetchStrategyDetails,
  patchBot,
} from "../../lib/ranging-api";
import type {
  BacktestTrade,
  StrategyConfigUiField,
} from "../../types/ranging-dashboard";
import { BacktestReplayChart } from "./BacktestReplayChart";

interface BacktestDetailsPageProps {
  botId: string;
  backtestId: string;
}

type ChartTimeframe = "15m" | "1h" | "2h" | "4h" | "1d";
type TradeBalanceProgression = {
  entryBalance: number;
  closeBalance: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeConfigString(value: unknown): string {
  return JSON.stringify(asRecord(value));
}

function getValueAtPath(
  object: Record<string, unknown>,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, object);
}

function collectConfigPaths(
  value: unknown,
  prefix = "",
  paths = new Set<string>(),
): Set<string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) paths.add(prefix);
    return paths;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 && prefix) {
    paths.add(prefix);
    return paths;
  }

  for (const [key, child] of entries) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    collectConfigPaths(child, nextPrefix, paths);
  }

  return paths;
}

function labelFromPath(path: string): string {
  const leaf = path.split(".").at(-1) ?? path;
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function formatConfigValue(
  value: unknown,
  options?: {
    valueFormat?: "raw" | "fraction-percent" | "percent";
    suffix?: string;
    decimals?: number;
  },
): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    let display = value;
    if (options?.valueFormat === "fraction-percent") {
      display = value * 100;
    }
    const fixed =
      typeof options?.decimals === "number"
        ? display.toFixed(options.decimals)
        : String(display);
    const compact = fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
    return `${compact}${options?.suffix ?? ""}`;
  }

  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "[]";
  if (value === undefined) return "Not set";
  if (value === null) return "null";
  return JSON.stringify(value);
}

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
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("4h");
  const [compareOpen, setCompareOpen] = useState(false);
  const [applyFeedback, setApplyFeedback] = useState<string | undefined>();
  const [applying, setApplying] = useState(false);

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
  const { data: botDetails, mutate: mutateBotDetails } = useSWR(
    ["bot-details", botId],
    ([, id]) => fetchBotDetails(String(id)),
    { revalidateOnFocus: false },
  );
  const { data: strategyDetails } = useSWR(
    details?.backtest.strategyId
      ? ["strategy-details", details.backtest.strategyId]
      : null,
    ([, strategyId]) => fetchStrategyDetails(String(strategyId)),
    { revalidateOnFocus: false },
  );

  const bestTrade = useMemo(() => {
    if (!details) return undefined;
    return [...details.trades].sort((a, b) => b.netPnl - a.netPnl)[0];
  }, [details]);

  const worstTrade = useMemo(() => {
    if (!details) return undefined;
    return [...details.trades].sort((a, b) => a.netPnl - b.netPnl)[0];
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
  const configUiByPath = new Map(
    (strategySummary?.configUi ?? []).map((field) => [field.path, field]),
  );
  const backtestStrategyConfig = asRecord(backtest.strategyConfig);
  const currentBotStrategyConfig = asRecord(botDetails?.bot.runtime.strategyConfig);
  const hasSnapshot = Object.keys(backtestStrategyConfig).length > 0;
  const differsFromBot =
    hasSnapshot &&
    normalizeConfigString(backtestStrategyConfig) !==
      normalizeConfigString(currentBotStrategyConfig);
  const snapshotRows = (
    [...collectConfigPaths(backtestStrategyConfig)]
      .map((path) => ({
        path,
        field: configUiByPath.get(path),
        value: getValueAtPath(backtestStrategyConfig, path),
      }))
      .sort((left, right) => {
        const leftOrder = left.field?.order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.field?.order ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.path.localeCompare(right.path);
      })
  );
  const configDiffRows = (
    [...collectConfigPaths(currentBotStrategyConfig), ...collectConfigPaths(backtestStrategyConfig)]
      .filter((path, index, values) => values.indexOf(path) === index)
      .map((path) => ({
        path,
        field: configUiByPath.get(path),
        currentValue: getValueAtPath(currentBotStrategyConfig, path),
        backtestValue: getValueAtPath(backtestStrategyConfig, path),
      }))
      .filter(
        (entry) =>
          normalizeConfigString({ value: entry.currentValue }) !==
          normalizeConfigString({ value: entry.backtestValue }),
      )
      .sort((left, right) => {
        const leftOrder = left.field?.order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.field?.order ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.path.localeCompare(right.path);
      })
  );

  async function applySnapshotToBot() {
    if (!hasSnapshot || applying) return;

    setApplying(true);
    setApplyFeedback(undefined);

    try {
      await patchBot(botId, { strategyConfig: backtestStrategyConfig });
      setApplyFeedback("Backtest settings applied to the bot.");
      await mutateBotDetails();
      setCompareOpen(false);
    } catch (error) {
      setApplyFeedback(
        `Failed to apply settings: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setApplying(false);
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
              leadingIcon={<Search className="h-4 w-4" />}
              onClick={() => setCompareOpen(true)}
              disabled={!hasSnapshot}
            >
              Compare Settings
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                void applySnapshotToBot();
              }}
              disabled={!differsFromBot || applying}
            >
              {applying ? "Applying..." : "Apply To Bot"}
            </Button>
          </div>
        </div>
      </Panel>

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
              Strategy Snapshot
            </h3>
            <p className="text-xs text-slate-400">
              Settings frozen into this backtest at queue time.
            </p>
          </div>
          {hasSnapshot ? (
            differsFromBot ? (
              <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-xs text-amber-100">
                snapshot differs from current bot
              </span>
            ) : (
              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100">
                snapshot matches current bot
              </span>
            )
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-400">
              no snapshot stored
            </span>
          )}
        </div>

        {snapshotRows.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {snapshotRows.map((entry) => (
              <Panel key={entry.path} className="space-y-2 p-4" tone="muted">
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {entry.field?.label ?? labelFromPath(entry.path)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {entry.field?.description ?? entry.path}
                  </p>
                </div>
                <p className="text-sm text-cyan-100">
                  {formatConfigValue(entry.value, entry.field)}
                </p>
              </Panel>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            No strategy snapshot was stored on this backtest.
          </p>
        )}

        {applyFeedback ? (
          <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
            {applyFeedback}
          </div>
        ) : null}
      </Panel>

      <BacktestReplayChart details={details} />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel className="p-4">
          <h3 className="text-sm font-semibold text-slate-100">Best Trade</h3>
          {bestTrade ? (
            <p className="mt-2 text-sm text-emerald-300">
              #{bestTrade.id} {bestTrade.side}{" "}
              {formatCurrency(bestTrade.netPnl)}
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

      <Drawer
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="Compare Backtest Settings"
        description="Review the exact parameter differences between the current bot settings and this backtest snapshot."
        footer={
          <div className="flex flex-wrap justify-between gap-2">
            <div className="text-xs text-slate-400">
              {configDiffRows.length} changed field
              {configDiffRows.length === 1 ? "" : "s"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setCompareOpen(false)}>Close</Button>
              <Button
                variant="primary"
                onClick={() => {
                  void applySnapshotToBot();
                }}
                disabled={!differsFromBot || applying}
              >
                {applying ? "Applying..." : "Apply To Bot"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {configDiffRows.length === 0 ? (
            <Panel className="px-4 py-3 text-sm text-slate-300" tone="muted">
              This backtest snapshot matches the current bot settings.
            </Panel>
          ) : (
            <div className="space-y-3">
              {configDiffRows.map((entry) => (
                <Panel key={entry.path} className="space-y-3 p-4" tone="muted">
                  <div>
                    <p className="text-sm font-medium text-slate-100">
                      {entry.field?.label ?? labelFromPath(entry.path)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {entry.field?.description ?? entry.path}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr]">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        Current Bot
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-100">
                        {formatConfigValue(entry.currentValue, entry.field)}
                      </p>
                    </div>

                    <div className="flex items-center justify-center text-slate-500">
                      →
                    </div>

                    <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-200/80">
                        Backtest Snapshot
                      </p>
                      <p className="mt-2 text-sm font-medium text-cyan-50">
                        {formatConfigValue(entry.backtestValue, entry.field)}
                      </p>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
