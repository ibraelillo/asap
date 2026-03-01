import { useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Activity,
  ArrowRight,
  Bot,
  History,
  Layers3,
  Shield,
} from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Switch } from "@repo/ui";
import { MetricCard } from "../../trade-results/MetricCard";
import {
  fetchStrategyDetails,
  fetchBotDetails,
  fetchBotIndicatorPool,
  fetchBotPositions,
  fetchBotStats,
  fetchRuns,
  patchBot,
} from "../../../lib/ranging-api";
import {
  ReasonBadges,
  SectionHeader,
  formatCurrency,
  formatDateTime,
} from "../BotUi";
import {
  StrategyConfigEditor,
  type StrategyConfigEditorHandle,
} from "../StrategyConfigEditor";
import { StrategyAnalysisSnapshot } from "../StrategyConfigSnapshot";
import { asRecord, cloneRecord, mergeConfigDefaults } from "../config-utils";

function formatIndicatorParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return "-";

  return entries
    .map(([key, value]) =>
      typeof value === "number" || typeof value === "string"
        ? `${key}=${value}`
        : `${key}=${JSON.stringify(value)}`,
    )
    .join(" · ");
}

function formatLatestValues(values?: Record<string, number>): string {
  if (!values || Object.keys(values).length === 0) return "-";
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`)
    .join(" · ");
}

export function BotDetailsPage() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const strategyConfigEditorRef = useRef<StrategyConfigEditorHandle>(null);
  const [actionError, setActionError] = useState<string | undefined>();
  const [actionLoading, setActionLoading] = useState<
    "pause" | "resume" | "archive" | null
  >(null);
  const [configError, setConfigError] = useState<string | undefined>();
  const [configSuccess, setConfigSuccess] = useState<string | undefined>();
  const [configSaving, setConfigSaving] = useState(false);
  const [modeError, setModeError] = useState<string | undefined>();
  const [modeSuccess, setModeSuccess] = useState<string | undefined>();
  const [modeSaving, setModeSaving] = useState(false);
  const [draftStrategyConfig, setDraftStrategyConfig] = useState<
    Record<string, unknown>
  >({});

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
  const { data: indicatorPool } = useSWR(
    botId ? ["bot-indicator-pool", botId] : null,
    ([, id]) => fetchBotIndicatorPool(String(id)),
    { refreshInterval: 20_000, revalidateOnFocus: false },
  );
  const { data: strategyDetails } = useSWR(
    botDetails?.bot.strategyId
      ? ["strategy-details", botDetails.bot.strategyId]
      : null,
    ([, strategyId]) => fetchStrategyDetails(String(strategyId)),
    { revalidateOnFocus: false },
  );

  const effectiveBotStrategyConfig = mergeConfigDefaults(
    asRecord(strategyDetails?.strategy.configDefaults),
    asRecord(botDetails?.bot.runtime.strategyConfig),
  );
  const configSyncKey = `${botDetails?.bot.updatedAtMs ?? "none"}:${strategyDetails?.strategy.strategyId ?? "none"}`;

  useEffect(() => {
    if (!botDetails) return;

    setDraftStrategyConfig(cloneRecord(effectiveBotStrategyConfig));
    strategyConfigEditorRef.current?.resetDrafts();
  }, [configSyncKey]);

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
    positions?.positions?.find((position) => position.status !== "closed");
  const recentBacktests = botDetails.backtests.slice(0, 6);
  const recentValidations = botDetails.validations.slice(0, 6);
  const botStatus = botDetails.bot.status;
  const strategySummary = strategyDetails?.strategy;

  async function updateBotStatus(nextStatus: "active" | "paused" | "archived") {
    if (!botId) return;
    setActionError(undefined);
    setActionLoading(
      nextStatus === "active"
        ? "resume"
        : nextStatus === "paused"
          ? "pause"
          : "archive",
    );

    try {
      await patchBot(botId, { status: nextStatus });
      await Promise.all([
        mutate(["bot-details", botId]),
        mutate(["bot-stats", botId]),
        mutate(["bot-positions", botId]),
        mutate("ranging-dashboard"),
      ]);
      if (nextStatus === "archived") {
        navigate("/bots");
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(null);
    }
  }

  async function saveStrategyConfig() {
    if (!botId) return;

    const resolved = strategyConfigEditorRef.current?.resolveForSubmit() ?? {
      valid: true,
      config: asRecord(draftStrategyConfig),
    };
    if (!resolved.valid) {
      setConfigError("Fix the highlighted strategy parameters before saving.");
      setConfigSuccess(undefined);
      return;
    }

    setConfigSaving(true);
    setConfigError(undefined);
    setConfigSuccess(undefined);

    try {
      await patchBot(botId, {
        strategyConfig: resolved.config,
      });
      setDraftStrategyConfig(cloneRecord(resolved.config));
      setConfigSuccess("Strategy config updated.");
      await Promise.all([
        mutate(["bot-details", botId]),
        mutate(["bot-stats", botId]),
        mutate("ranging-dashboard"),
      ]);
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : String(error));
    } finally {
      setConfigSaving(false);
    }
  }

  async function updateDryRun(nextDryRun: boolean) {
    if (!botId) return;

    setModeSaving(true);
    setModeError(undefined);
    setModeSuccess(undefined);

    try {
      await patchBot(botId, { dryRun: nextDryRun });
      setModeSuccess(
        nextDryRun
          ? "Bot is now running in simulated mode."
          : "Bot is now allowed to place live orders.",
      );
      await Promise.all([
        mutate(["bot-details", botId]),
        mutate(["bot-stats", botId]),
        mutate(["bot-runs", botId]),
        mutate("ranging-dashboard"),
      ]);
    } catch (error) {
      setModeError(error instanceof Error ? error.message : String(error));
    } finally {
      setModeSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
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
            <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              Status: {botStatus}
            </div>
          </div>

          <div className="w-full space-y-3 xl:max-w-[760px]">
            <div className="xl:ml-auto xl:max-w-[540px]">
              <Switch
                checked={botDetails.bot.runtime.dryRun !== false}
                disabled={modeSaving}
                label="Simulated Execution"
                description={
                  botDetails.bot.runtime.dryRun === false
                    ? "Live orders are enabled. The bot can place real exchange orders while remaining active."
                    : "The bot stays active but only produces fake trades and dry-run order flows."
                }
                onChange={(checked) => {
                  void updateDryRun(checked);
                }}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={
                    botDetails.bot.runtime.dryRun === false
                      ? "rounded-full border border-rose-300/30 bg-rose-400/10 px-2 py-1 text-rose-100"
                      : "rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-emerald-100"
                  }
                >
                  {botDetails.bot.runtime.dryRun === false
                    ? "live orders enabled"
                    : "dry-run enabled"}
                </span>
                {modeSaving ? (
                  <span className="text-slate-400">
                    Updating runtime mode...
                  </span>
                ) : null}
              </div>
              {modeError ? (
                <p className="mt-2 text-sm text-rose-300">{modeError}</p>
              ) : null}
              {modeSuccess ? (
                <p className="mt-2 text-sm text-emerald-300">{modeSuccess}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {botStatus === "active" ? (
                <Button
                  size="sm"
                  className="h-11 w-full"
                  onClick={() => void updateBotStatus("paused")}
                  disabled={actionLoading !== null}
                >
                  Pause
                </Button>
              ) : null}
              {botStatus === "paused" ? (
                <Button
                  size="sm"
                  className="h-11 w-full"
                  onClick={() => void updateBotStatus("active")}
                  disabled={actionLoading !== null}
                >
                  Resume
                </Button>
              ) : null}
              {botStatus !== "archived" ? (
                <Button
                  size="sm"
                  variant="danger"
                  className="h-11 w-full"
                  onClick={() => void updateBotStatus("archived")}
                  disabled={actionLoading !== null}
                >
                  Archive
                </Button>
              ) : null}
              <Link
                to={`/bots/${encodeURIComponent(botId)}/backtests`}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-center text-xs text-cyan-100 transition hover:bg-cyan-400/20"
              >
                Open Backtests
              </Link>
              <Link
                to={`/bots/${encodeURIComponent(botId)}/positions`}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-xs text-slate-200 transition hover:bg-white/10"
              >
                Positions
              </Link>
              <Link
                to="/bots"
                className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-xs text-slate-200 transition hover:bg-white/10"
              >
                Back To Bots
              </Link>
            </div>
          </div>
        </div>
        {actionError ? (
          <p className="mt-4 text-sm text-rose-300">{actionError}</p>
        ) : null}
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

        <div className="mt-4">
          <ReasonBadges reasons={summary?.reasons ?? []} />
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <SectionHeader
            title="Strategy Analysis"
            description={`Latest ${strategySummary?.label ?? botDetails.bot.strategyId} analysis output for this bot.`}
          />
          <div className="mt-4">
            <StrategyAnalysisSnapshot
              strategy={strategySummary}
              analysis={asRecord(summary?.strategyAnalysis)}
            />
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <SectionHeader
          title="Position"
          description="Locally persisted lifecycle state."
        />
        {openPosition ? (
          <div className="grid grid-cols-2 gap-4 text-sm text-slate-200 lg:grid-cols-3 xl:grid-cols-6">
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
      </section>

      <section className="panel p-5">
        <SectionHeader
          title="Shared Feed Pool"
          description="Shared candle and indicator feeds this bot currently consumes from the exchange-scoped pool."
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Candle Feeds
            </p>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/40">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">TF</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Closed</th>
                    <th className="px-4 py-3">Bars</th>
                  </tr>
                </thead>
                <tbody>
                  {(indicatorPool?.marketFeeds ?? []).map((feed) => (
                    <tr
                      key={`${feed.role}-${feed.timeframe}`}
                      className="border-t border-white/5 text-slate-200"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-100">{feed.role}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          lookback {feed.lookbackBars}
                        </p>
                      </td>
                      <td className="px-4 py-3">{feed.timeframe}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs">
                          {feed.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {formatDateTime(feed.lastClosedCandleTime)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {feed.candleCount ?? "-"} / max {feed.maxLookbackBars}
                      </td>
                    </tr>
                  ))}
                  {(indicatorPool?.marketFeeds ?? []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-4 text-sm text-slate-400"
                      >
                        No shared candle feeds registered for this bot yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Indicator Feeds
            </p>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/40">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3">Feed</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Latest</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {(indicatorPool?.indicatorFeeds ?? []).map((feed) => (
                    <tr
                      key={`${feed.role}-${feed.timeframe}-${feed.paramsHash}`}
                      className="border-t border-white/5 align-top text-slate-200"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-100">
                          {feed.role}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {feed.indicatorId} / {feed.timeframe}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatIndicatorParams(feed.params)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs">
                          {feed.status}
                        </span>
                        {feed.errorMessage ? (
                          <p className="mt-2 max-w-xs text-xs text-rose-300">
                            {feed.errorMessage}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-cyan-100">
                        {formatLatestValues(feed.latestValues)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        <p>{formatDateTime(feed.lastComputedAt)}</p>
                        <p className="mt-1 text-slate-500">
                          candle {formatDateTime(feed.lastComputedCandleTime)}
                        </p>
                      </td>
                    </tr>
                  ))}
                  {(indicatorPool?.indicatorFeeds ?? []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-4 text-sm text-slate-400"
                      >
                        No shared indicator feeds registered for this bot yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="panel p-5">
          <SectionHeader
            title="Configuration"
            description="Persisted runtime contract for this bot."
          />
          <div className="grid grid-cols-2 gap-4 text-sm text-slate-200">
            <div>
              <p className="text-xs text-slate-400">Execution TF</p>
              <p className="mt-1">
                {botDetails.bot.runtime.executionTimeframe}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Execution Limit</p>
              <p className="mt-1">{botDetails.bot.runtime.executionLimit}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Primary Range TF</p>
              <p className="mt-1">
                {botDetails.bot.runtime.primaryRangeTimeframe}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Secondary Range TF</p>
              <p className="mt-1">
                {botDetails.bot.runtime.secondaryRangeTimeframe}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Execution Mode</p>
              <p className="mt-1">
                {botDetails.bot.runtime.dryRun === false ? "Live" : "Simulated"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Value Qty</p>
              <p className="mt-1">{botDetails.bot.runtime.valueQty ?? "-"}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4 border-t border-white/10 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Strategy Parameters
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">
                  {strategySummary?.label ?? botDetails.bot.strategyId}
                </h3>
                <p className="mt-1 text-sm text-slate-300/80">
                  {strategySummary?.description ??
                    "Bot-scoped strategy config persisted with this runtime contract."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={configSaving}
                  onClick={() => {
                    strategyConfigEditorRef.current?.resetDrafts();
                    setConfigError(undefined);
                    setConfigSuccess(undefined);
                    setDraftStrategyConfig(
                      cloneRecord(effectiveBotStrategyConfig),
                    );
                  }}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  disabled={configSaving || !strategySummary}
                  onClick={() => void saveStrategyConfig()}
                >
                  {configSaving ? "Saving..." : "Save Strategy Config"}
                </Button>
              </div>
            </div>

            <StrategyConfigEditor
              ref={strategyConfigEditorRef}
              strategy={strategySummary}
              value={draftStrategyConfig}
              onChange={setDraftStrategyConfig}
              emptyState="Loading strategy schema..."
              compact
            />

            {configError ? (
              <p className="text-sm text-rose-300">{configError}</p>
            ) : null}
            {configSuccess ? (
              <p className="text-sm text-emerald-300">{configSuccess}</p>
            ) : null}
          </div>
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
