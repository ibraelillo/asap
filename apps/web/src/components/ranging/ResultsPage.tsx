import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  ShieldAlert,
  Wifi,
} from "lucide-react";
import { MetricCard } from "../trade-results/MetricCard";
import type { DashboardPayload } from "../../types/ranging-dashboard";
import type { RealtimeState } from "../../lib/realtime";
import { SignalChart } from "./SignalChart";

interface ResultsPageProps {
  data: DashboardPayload | null;
  isLoading: boolean;
  error?: string;
  realtimeState: RealtimeState;
  realtimeDetails?: string;
  apiUrl: string;
  onOpenBot?: (botId: string) => void;
}

function realtimeTone(state: RealtimeState): string {
  switch (state) {
    case "connected":
      return "text-emerald-300";
    case "connecting":
      return "text-amber-300";
    case "error":
      return "text-rose-300";
    default:
      return "text-slate-400";
  }
}

function formatDateTime(value?: number): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function ResultsPage({
  data,
  isLoading,
  error,
  realtimeState,
  realtimeDetails,
  apiUrl,
  onOpenBot,
}: ResultsPageProps) {
  if (!data && isLoading) {
    return (
      <div className="panel flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <CircleDashed className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
          <p className="mt-3 text-sm text-slate-300">
            Loading live bot results...
          </p>
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="panel p-6">
        <p className="text-sm text-rose-300">Failed to load dashboard data.</p>
        <p className="mt-2 text-xs text-slate-400 mono">
          {error ?? "Unknown API error"}
        </p>
      </div>
    );
  }

  const { metrics, trades, recentRuns } = data;

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
              Ranging Bot
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              Live Results
            </h1>
            <p className="mt-2 text-sm text-slate-300/90">
              Execution + analysis stream from the running bots
            </p>
          </div>

          <div className="space-y-1 text-right">
            <p
              className={`inline-flex items-center gap-2 text-sm ${realtimeTone(realtimeState)}`}
            >
              <Wifi className="h-4 w-4" />
              Realtime: {realtimeState}
            </p>
            {realtimeDetails ? (
              <p className="max-w-[32rem] text-xs text-slate-400 mono">
                {realtimeDetails}
              </p>
            ) : null}
            <p className="text-xs text-slate-400 mono">API: {apiUrl}</p>
            <p className="text-xs text-slate-400">
              Last sync: {new Date(data.generatedAt).toLocaleString()}
            </p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Runs"
          value={String(metrics.totalRuns)}
          icon={<Activity className="h-5 w-5" />}
          hint={`${metrics.noSignalRuns} no-signal`}
        />
        <MetricCard
          label="Signals"
          value={String(metrics.signalRuns)}
          tone={metrics.signalRuns > 0 ? "positive" : "neutral"}
          icon={<ArrowUpRight className="h-5 w-5" />}
          hint={`${metrics.longSignals} long / ${metrics.shortSignals} short`}
        />
        <MetricCard
          label="Orders Sent"
          value={String(metrics.orderSubmitted)}
          tone={metrics.orderSubmitted > 0 ? "positive" : "neutral"}
          icon={<CheckCircle2 className="h-5 w-5" />}
          hint={`${metrics.dryRunSignals} dry-run`}
        />
        <MetricCard
          label="Skipped"
          value={String(metrics.skippedSignals)}
          icon={<ArrowDownRight className="h-5 w-5" />}
        />
        <MetricCard
          label="Failures"
          value={String(metrics.failedRuns)}
          tone={metrics.failedRuns > 0 ? "negative" : "positive"}
          icon={<ShieldAlert className="h-5 w-5" />}
        />
      </section>

      <SignalChart runs={recentRuns.slice(0, 180)} />

      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">
              Recent Trade Signals
            </h3>
            <p className="text-xs text-slate-400">
              Signals and order attempt status
            </p>
          </div>
          <p className="text-xs text-slate-400">
            {trades.length} signal events
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">Time</th>
                <th className="pb-3 pr-4">Symbol</th>
                <th className="pb-3 pr-4">Side</th>
                <th className="pb-3 pr-4">Price</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Reasons</th>
                <th className="pb-3">Order ID</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 120).map((trade) => {
                const sideTone =
                  trade.side === "long" ? "text-emerald-300" : "text-amber-300";
                const statusTone =
                  trade.processingStatus === "order-submitted"
                    ? "text-emerald-300"
                    : trade.processingStatus === "error"
                      ? "text-rose-300"
                      : "text-slate-300";

                return (
                  <tr
                    key={trade.id}
                    className="border-t border-white/5 text-slate-200"
                  >
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {formatDateTime(trade.generatedAtMs)}
                    </td>
                    <td className="py-3 pr-4 font-medium">
                      <button
                        onClick={() => onOpenBot?.(trade.botId)}
                        className="text-left text-cyan-200 transition hover:text-cyan-100"
                      >
                        {trade.symbol}
                      </button>
                    </td>
                    <td className={`py-3 pr-4 font-medium ${sideTone}`}>
                      {trade.side}
                    </td>
                    <td className="py-3 pr-4">
                      {trade.price?.toLocaleString() ?? "-"}
                    </td>
                    <td
                      className={`py-3 pr-4 text-xs font-medium ${statusTone}`}
                    >
                      {trade.processingStatus}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {trade.reasons.join(", ")}
                    </td>
                    <td className="py-3 mono text-xs text-slate-400">
                      {trade.orderId ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
