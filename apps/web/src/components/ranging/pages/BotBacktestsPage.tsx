import { useState } from "react";
import useSWR from "swr";
import {
  CheckCircle2,
  History,
  Loader2,
  Play,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { Select } from "@repo/ui";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  createBacktest,
  createRangeValidation,
  fetchBacktests,
  fetchBotDetails,
  fetchBotStats,
  fetchRangeValidations,
} from "../../../lib/ranging-api";
import { MetricCard } from "../../trade-results/MetricCard";
import { SectionHeader, formatCurrency, formatDateTime } from "../BotUi";

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInputDaysAgo(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return toDateInputValue(date);
}

function parseDateStartMs(value: string): number | undefined {
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part)))
    return undefined;
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined)
    return undefined;
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDateEndMs(value: string): number | undefined {
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part)))
    return undefined;
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined)
    return undefined;
  const parsed = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BotBacktestsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [backtestFromDate, setBacktestFromDate] = useState<string>(() =>
    dateInputDaysAgo(30),
  );
  const [backtestToDate, setBacktestToDate] = useState<string>(() =>
    dateInputDaysAgo(0),
  );
  const [backtestInitialEquity, setBacktestInitialEquity] =
    useState<number>(1000);
  const [backtestUseAi, setBacktestUseAi] = useState<boolean>(false);
  const [backtestAiLookbackCandles, setBacktestAiLookbackCandles] =
    useState<number>(240);
  const [backtestAiCadenceBars, setBacktestAiCadenceBars] = useState<number>(1);
  const [backtestAiMaxEvaluations, setBacktestAiMaxEvaluations] =
    useState<number>(50);
  const [backtestAiConfidenceThreshold, setBacktestAiConfidenceThreshold] =
    useState<number>(0.72);
  const [creatingBacktest, setCreatingBacktest] = useState(false);
  const [backtestFeedback, setBacktestFeedback] = useState<
    string | undefined
  >();
  const [validationTimeframe, setValidationTimeframe] = useState<string>("15m");
  const [validationFromDate, setValidationFromDate] = useState<string>(() =>
    dateInputDaysAgo(30),
  );
  const [validationToDate, setValidationToDate] = useState<string>(() =>
    dateInputDaysAgo(0),
  );
  const [validationCandlesCount, setValidationCandlesCount] =
    useState<number>(240);
  const [creatingValidation, setCreatingValidation] = useState(false);
  const [validationFeedback, setValidationFeedback] = useState<
    string | undefined
  >();

  const { data: botDetails } = useSWR(
    botId ? ["bot-details", botId] : null,
    ([, id]) => fetchBotDetails(String(id)),
    { revalidateOnFocus: false },
  );
  const {
    data: backtests,
    isLoading: backtestsLoading,
    mutate: mutateBacktests,
  } = useSWR(
    botId ? ["bot-backtests", botId] : null,
    ([, id]) => fetchBacktests(80, String(id)),
    {
      refreshInterval: (latestData) =>
        Array.isArray(latestData) &&
        latestData.some((entry) => entry.status === "running")
          ? 8_000
          : 60_000,
      revalidateOnFocus: false,
    },
  );
  const {
    data: validations,
    isLoading: validationsLoading,
    mutate: mutateValidations,
  } = useSWR(
    botId ? ["bot-validations", botId] : null,
    ([, id]) => fetchRangeValidations(80, String(id)),
    { refreshInterval: 20_000, revalidateOnFocus: false },
  );
  const { data: stats, mutate: mutateStats } = useSWR(
    botId ? ["bot-stats", botId] : null,
    ([, id]) => fetchBotStats(String(id), 24),
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  if (!botId) {
    return <Navigate to="/bots" replace />;
  }

  const symbol =
    botDetails?.summary && "symbol" in botDetails.summary
      ? botDetails.summary.symbol
      : botDetails?.bot && typeof botDetails.bot.symbol === "string"
        ? botDetails.bot.symbol
        : botId;

  async function onCreateBacktest() {
    if (creatingBacktest) return;

    const fromMs = parseDateStartMs(backtestFromDate);
    const toMs = parseDateEndMs(backtestToDate);
    if (!fromMs || !toMs) {
      setBacktestFeedback("Select a valid start and end date.");
      return;
    }
    if (fromMs >= toMs) {
      setBacktestFeedback("The start date must be before the end date.");
      return;
    }

    setCreatingBacktest(true);
    setBacktestFeedback(undefined);

    try {
      const backtest = await createBacktest(botId, {
        fromMs,
        toMs,
        initialEquity: backtestInitialEquity,
        ai: {
          enabled: backtestUseAi,
          lookbackCandles: backtestAiLookbackCandles,
          cadenceBars: backtestAiCadenceBars,
          maxEvaluations: backtestAiMaxEvaluations,
          confidenceThreshold: backtestAiConfidenceThreshold,
        },
      });

      setBacktestFeedback(
        backtest.status === "running"
          ? backtest.ai?.enabled
            ? "AI-integrated backtest queued. It will appear in the list shortly."
            : "Backtest queued. It will appear in the list shortly."
          : backtest.status === "completed"
            ? `Backtest ready: net ${formatCurrency(backtest.netPnl)} on ${backtest.totalTrades} trades.`
            : `Backtest failed: ${backtest.errorMessage ?? "Unknown error"}`,
      );

      await Promise.all([mutateBacktests(), mutateStats()]);
    } catch (error) {
      setBacktestFeedback(
        `Backtest request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setCreatingBacktest(false);
    }
  }

  async function onCreateValidation() {
    if (creatingValidation) return;

    const fromMs = parseDateStartMs(validationFromDate);
    const toMs = parseDateEndMs(validationToDate);
    if (!fromMs || !toMs) {
      setValidationFeedback("Select a valid start and end date.");
      return;
    }
    if (fromMs >= toMs) {
      setValidationFeedback("The start date must be before the end date.");
      return;
    }

    setCreatingValidation(true);
    setValidationFeedback(undefined);

    try {
      const validation = await createRangeValidation(botId, {
        timeframe: validationTimeframe,
        fromMs,
        toMs,
        candlesCount: validationCandlesCount,
      });

      setValidationFeedback(
        validation.status === "pending"
          ? "Validation queued. It will appear in the list shortly."
          : validation.status === "completed"
            ? `Validation completed with ${((validation.result?.confidence ?? 0) * 100).toFixed(1)}% confidence.`
            : `Validation failed: ${validation.errorMessage ?? "Unknown error"}`,
      );

      await mutateValidations();
    } catch (error) {
      setValidationFeedback(
        `Validation request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setCreatingValidation(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
              Bot Backtests
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              {symbol}
            </h1>
            <p className="mt-2 text-sm text-slate-300/90">
              Backtest queue, historical results, and bot-scoped validation
              jobs.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to={`/bots/${encodeURIComponent(botId)}`}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
            >
              Back To Bot
            </Link>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Backtests"
          value={String(stats?.backtests.total ?? backtests?.length ?? 0)}
          icon={<History className="h-5 w-5" />}
        />
        <MetricCard
          label="Running"
          value={String(stats?.backtests.running ?? 0)}
          icon={<Loader2 className="h-5 w-5" />}
        />
        <MetricCard
          label="Latest Net PnL"
          value={formatCurrency(stats?.backtests.latestNetPnl ?? 0)}
          tone={
            (stats?.backtests.latestNetPnl ?? 0) >= 0 ? "positive" : "negative"
          }
          icon={<History className="h-5 w-5" />}
        />
      </section>

      <div className="panel p-5">
        <SectionHeader
          title="Backtests"
          description="Run historical backtests in backend and track performance for this bot."
          aside={
            backtestFeedback ? (
              <p className="text-xs text-cyan-200">{backtestFeedback}</p>
            ) : undefined
          }
        />

        <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-slate-900/45 p-3">
          <div className="inline-flex h-[54px] items-end pb-1 text-xs text-slate-300">
            Symbol:{" "}
            <span className="ml-1 font-medium text-cyan-200">{symbol}</span>
          </div>

          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            From
            <input
              type="date"
              value={backtestFromDate}
              onChange={(event) => setBacktestFromDate(event.target.value)}
              className="rounded bg-slate-950/60 px-2 py-1 text-slate-100 outline-none"
            />
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            To
            <input
              type="date"
              value={backtestToDate}
              onChange={(event) => setBacktestToDate(event.target.value)}
              className="rounded bg-slate-950/60 px-2 py-1 text-slate-100 outline-none"
            />
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            Initial Equity
            <input
              type="number"
              min={100}
              value={backtestInitialEquity}
              onChange={(event) =>
                setBacktestInitialEquity(
                  Math.max(100, Number(event.target.value) || 1000),
                )
              }
              className="w-28 rounded bg-slate-950/60 px-2 py-1 text-right text-slate-100 outline-none"
            />
          </label>

          <label className="inline-flex h-[54px] items-end gap-2 pb-1 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={backtestUseAi}
              onChange={(event) => setBacktestUseAi(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-slate-950/60 text-cyan-300"
            />
            AI range validation
          </label>

          {backtestUseAi ? (
            <>
              <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
                AI Lookback
                <input
                  type="number"
                  min={60}
                  max={600}
                  value={backtestAiLookbackCandles}
                  onChange={(event) =>
                    setBacktestAiLookbackCandles(
                      Math.max(
                        60,
                        Math.min(600, Number(event.target.value) || 240),
                      ),
                    )
                  }
                  className="w-24 rounded bg-slate-950/60 px-2 py-1 text-right text-slate-100 outline-none"
                />
              </label>
              <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
                AI Cadence
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={backtestAiCadenceBars}
                  onChange={(event) =>
                    setBacktestAiCadenceBars(
                      Math.max(
                        1,
                        Math.min(24, Number(event.target.value) || 1),
                      ),
                    )
                  }
                  className="w-20 rounded bg-slate-950/60 px-2 py-1 text-right text-slate-100 outline-none"
                />
              </label>
              <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
                AI Max Calls
                <input
                  type="number"
                  min={1}
                  max={400}
                  value={backtestAiMaxEvaluations}
                  onChange={(event) =>
                    setBacktestAiMaxEvaluations(
                      Math.max(
                        1,
                        Math.min(400, Number(event.target.value) || 50),
                      ),
                    )
                  }
                  className="w-24 rounded bg-slate-950/60 px-2 py-1 text-right text-slate-100 outline-none"
                />
              </label>
              <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
                AI Min Conf
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={backtestAiConfidenceThreshold}
                  onChange={(event) =>
                    setBacktestAiConfidenceThreshold(
                      Math.max(
                        0,
                        Math.min(1, Number(event.target.value) || 0.72),
                      ),
                    )
                  }
                  className="w-24 rounded bg-slate-950/60 px-2 py-1 text-right text-slate-100 outline-none"
                />
              </label>
            </>
          ) : null}

          <button
            onClick={() => {
              void onCreateBacktest();
            }}
            disabled={creatingBacktest}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5" />
            {creatingBacktest
              ? "Running... (it will appear shortly)"
              : "Run Backtest"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">Created</th>
                <th className="pb-3 pr-4">Mode</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Progress</th>
                <th className="pb-3 pr-4">Trades</th>
                <th className="pb-3 pr-4">Win Rate</th>
                <th className="pb-3 pr-4">Net PnL</th>
                <th className="pb-3">Ending Equity</th>
              </tr>
            </thead>
            <tbody>
              {(backtests ?? []).map((backtest) => {
                const detailHref = `/bots/${encodeURIComponent(botId)}/backtests/${encodeURIComponent(backtest.id)}`;
                const aiProgress =
                  backtest.ai?.enabled && backtest.ai.plannedEvaluations > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (backtest.ai.evaluationsRun /
                            backtest.ai.plannedEvaluations) *
                            100,
                        ),
                      )
                    : undefined;
                const progressLabel =
                  backtest.status === "running"
                    ? aiProgress !== undefined
                      ? `${Math.min(aiProgress, 99)}% (${backtest.ai?.evaluationsRun ?? 0}/${backtest.ai?.plannedEvaluations ?? 0})`
                      : "queued"
                    : backtest.status === "completed"
                      ? "100%"
                      : aiProgress !== undefined
                        ? `${aiProgress}%`
                        : "-";

                return (
                  <tr
                    key={backtest.id}
                    className="border-t border-white/5 text-slate-200"
                  >
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      <Link
                        to={detailHref}
                        className="text-cyan-200 transition hover:text-cyan-100"
                      >
                        {formatDateTime(backtest.createdAtMs)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      {backtest.ai?.enabled ? (
                        <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-100">
                          AI
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                          Core
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">{backtest.status}</td>
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {progressLabel}
                    </td>
                    <td className="py-3 pr-4">{backtest.totalTrades}</td>
                    <td className="py-3 pr-4">
                      {(backtest.winRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 pr-4">
                      {formatCurrency(backtest.netPnl)}
                    </td>
                    <td className="py-3">
                      {formatCurrency(backtest.endingEquity)}
                    </td>
                  </tr>
                );
              })}
              {backtestsLoading && (backtests?.length ?? 0) === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-4 text-center text-xs text-slate-400"
                  >
                    Loading backtests...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel p-5">
        <SectionHeader
          title="Range Validation (LLM)"
          description="Queue async range checks powered by the validation worker."
          aside={
            validationFeedback ? (
              <p className="text-xs text-cyan-200">{validationFeedback}</p>
            ) : undefined
          }
        />

        <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-slate-900/45 p-3">
          <div className="inline-flex h-[54px] items-end pb-1 text-xs text-slate-300">
            Symbol:{" "}
            <span className="ml-1 font-medium text-cyan-200">{symbol}</span>
          </div>

          <label className="inline-flex min-w-[120px] flex-col gap-1 text-xs text-slate-300">
            Timeframe
            <Select
              value={validationTimeframe}
              onChange={setValidationTimeframe}
              options={[
                { value: "15m", label: "15m" },
                { value: "1h", label: "1h" },
                { value: "2h", label: "2h" },
                { value: "4h", label: "4h" },
                { value: "1d", label: "1d" },
              ]}
              buttonClassName="px-2 py-1 text-sm"
            />
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            Candles
            <input
              type="number"
              min={60}
              max={600}
              value={validationCandlesCount}
              onChange={(event) =>
                setValidationCandlesCount(
                  Math.max(
                    60,
                    Math.min(600, Number(event.target.value) || 240),
                  ),
                )
              }
              className="w-24 rounded bg-slate-950/60 px-2 py-1 text-right text-slate-100 outline-none"
            />
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            From
            <input
              type="date"
              value={validationFromDate}
              onChange={(event) => setValidationFromDate(event.target.value)}
              className="rounded bg-slate-950/60 px-2 py-1 text-slate-100 outline-none"
            />
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            To
            <input
              type="date"
              value={validationToDate}
              onChange={(event) => setValidationToDate(event.target.value)}
              className="rounded bg-slate-950/60 px-2 py-1 text-slate-100 outline-none"
            />
          </label>

          <button
            onClick={() => {
              void onCreateValidation();
            }}
            disabled={creatingValidation}
            className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-300/30 bg-fuchsia-400/15 px-3 py-2 text-xs text-fuchsia-100 transition hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingValidation ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <WandSparkles className="h-3.5 w-3.5" />
            )}
            {creatingValidation
              ? "Running... (result appears shortly)"
              : "Run Validation"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">Created</th>
                <th className="pb-3 pr-4">Timeframe</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Range</th>
                <th className="pb-3 pr-4">Confidence</th>
                <th className="pb-3 pr-4">Model</th>
                <th className="pb-3">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {(validations ?? []).map((validation) => {
                const range = validation.result?.range;
                const confidence = validation.result?.confidence;
                const model = validation.finalModel ?? validation.modelPrimary;

                return (
                  <tr
                    key={validation.id}
                    className="border-t border-white/5 text-slate-200"
                  >
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {formatDateTime(validation.createdAtMs)}
                    </td>
                    <td className="py-3 pr-4">{validation.timeframe}</td>
                    <td className="py-3 pr-4 text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        {validation.status === "completed" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                        ) : validation.status === "pending" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-rose-300" />
                        )}
                        {validation.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {range
                        ? `VAL ${range.val.toFixed(2)} / POC ${range.poc.toFixed(2)} / VAH ${range.vah.toFixed(2)}`
                        : "-"}
                    </td>
                    <td className="py-3 pr-4">
                      {typeof confidence === "number"
                        ? `${(confidence * 100).toFixed(1)}%`
                        : "-"}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {model}
                    </td>
                    <td className="py-3 text-xs text-slate-300">
                      {validation.errorMessage
                        ? validation.errorMessage
                        : (validation.result?.reasons.length ?? 0) > 0
                          ? validation.result?.reasons.join(", ")
                          : "-"}
                    </td>
                  </tr>
                );
              })}
              {validationsLoading && (validations?.length ?? 0) === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-4 text-center text-xs text-slate-400"
                  >
                    Loading validations...
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
