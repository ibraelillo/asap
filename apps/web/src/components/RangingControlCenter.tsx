import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { BarChart3, Bot, CandlestickChart } from "lucide-react";
import {
  connectRealtime,
  type RealtimeErrorContext,
  type RealtimeState,
} from "../lib/realtime";
import { fetchDashboard, getApiUrl } from "../lib/ranging-api";
import type { DashboardPayload } from "../types/ranging-dashboard";
import { ResultsPage } from "./ranging/ResultsPage";
import { BotsPage } from "./ranging/BotsPage";
import { TradeAnalysisPage } from "./ranging/TradeAnalysisPage";

type Tab = "results" | "bots" | "trade-analysis";

function useDashboardData() {
  return useSWR<DashboardPayload>(
    "ranging-dashboard",
    () => fetchDashboard(240),
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
    },
  );
}

export function RangingControlCenter() {
  const [activeTab, setActiveTab] = useState<Tab>("results");
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("disabled");
  const [realtimeDetails, setRealtimeDetails] = useState<string | undefined>();
  const didRunDevStrictEffect = useRef(false);
  const lastRealtimeErrorRef = useRef<string | undefined>();
  const realtimeDebugEnabled =
    import.meta.env.DEV &&
    import.meta.env.VITE_RANGING_REALTIME_DEBUG === "true";

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useDashboardData();
  const mutateRef = useRef(mutate);

  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);

  useEffect(() => {
    // React StrictMode in dev runs setup+cleanup once before the "real" setup.
    // Skip that preflight setup so we don't open/close the MQTT socket immediately.
    if (import.meta.env.DEV && !didRunDevStrictEffect.current) {
      didRunDevStrictEffect.current = true;
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const disconnect = connectRealtime({
      onStateChange: (state, details) => {
        setRealtimeState(state);
        setRealtimeDetails(details);
        if (details && realtimeDebugEnabled) {
          console.debug(`[realtime] ${state}: ${details}`);
        }
      },
      onMessage: () => {
        if (timeoutId) return;

        timeoutId = setTimeout(() => {
          timeoutId = undefined;
          void mutateRef.current();
        }, 600);
      },
      onDebug: realtimeDebugEnabled
        ? (message) => {
            console.debug(`[realtime] ${message}`);
          }
        : undefined,
      onError: (context: RealtimeErrorContext) => {
        const at = new Date(context.timestamp).toLocaleTimeString();
        const details = `[${at}] ${context.source}: ${context.details}`;
        setRealtimeDetails(details);

        const dedupeKey = `${context.source}|${context.details}`;
        if (realtimeDebugEnabled && dedupeKey !== lastRealtimeErrorRef.current) {
          lastRealtimeErrorRef.current = dedupeKey;
          console.error(`[realtime] ${details}`);
        }
      },
    });

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      disconnect();
    };
  }, [realtimeDebugEnabled]);

  const apiUrl = useMemo(() => getApiUrl(), []);

  const tabClass = (tab: Tab) => {
    const selected = tab === activeTab;
    return selected
      ? "bg-cyan-400/20 text-cyan-100 border-cyan-300/30"
      : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10";
  };

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <nav className="panel p-3">
          <div className="inline-flex items-center gap-2 rounded-xl bg-slate-950/40 p-1">
            <button
              onClick={() => setActiveTab("results")}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${tabClass("results")}`}
            >
              <BarChart3 className="h-4 w-4" />
              Results
            </button>
            <button
              onClick={() => setActiveTab("bots")}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${tabClass("bots")}`}
            >
              <Bot className="h-4 w-4" />
              Bots
            </button>
            <button
              onClick={() => setActiveTab("trade-analysis")}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${tabClass("trade-analysis")}`}
            >
              <CandlestickChart className="h-4 w-4" />
              Trade Analysis
            </button>
          </div>
        </nav>

        {activeTab === "results" ? (
          <ResultsPage
            data={data ?? null}
            isLoading={isLoading}
            error={error instanceof Error ? error.message : undefined}
            realtimeState={realtimeState}
            realtimeDetails={realtimeDetails}
            apiUrl={apiUrl}
          />
        ) : activeTab === "bots" ? (
          <BotsPage data={data ?? null} />
        ) : (
          <TradeAnalysisPage data={data ?? null} />
        )}
      </div>
    </div>
  );
}
