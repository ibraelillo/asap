import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { BarChart3, Bot, CandlestickChart, KeyRound, Layers3 } from "lucide-react";
import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import {
  connectRealtime,
  type RealtimeErrorContext,
  type RealtimeState,
} from "../../lib/realtime";
import { fetchDashboard, getApiUrl } from "../../lib/ranging-api";
import type { DashboardPayload } from "../../types/ranging-dashboard";

export interface AppShellContextValue {
  dashboard: DashboardPayload | null;
  dashboardError?: string;
  isDashboardLoading: boolean;
  realtimeState: RealtimeState;
  realtimeDetails?: string;
  apiUrl: string;
  refreshDashboard: () => Promise<DashboardPayload | undefined>;
}

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

function navClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? "bg-cyan-400/20 text-cyan-100 border-cyan-300/30"
    : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10";
}

export function AppShell() {
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("disabled");
  const [realtimeDetails, setRealtimeDetails] = useState<string | undefined>();
  const didRunDevStrictEffect = useRef(false);
  const lastRealtimeErrorRef = useRef<string | undefined>(undefined);
  const realtimeDebugEnabled =
    import.meta.env.DEV &&
    import.meta.env.VITE_RANGING_REALTIME_DEBUG === "true";

  const { data, error, isLoading, mutate } = useDashboardData();
  const { mutate: globalMutate } = useSWRConfig();
  const mutateRef = useRef(mutate);
  const globalMutateRef = useRef(globalMutate);

  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);

  useEffect(() => {
    globalMutateRef.current = globalMutate;
  }, [globalMutate]);

  useEffect(() => {
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
      onMessage: (message) => {
        if (message.type === "feed") {
          void globalMutateRef.current(
            (key) => Array.isArray(key) && key[0] === "bot-indicator-pool",
            undefined,
            { revalidate: true },
          );
          return;
        }

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
        if (
          realtimeDebugEnabled &&
          dedupeKey !== lastRealtimeErrorRef.current
        ) {
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

  const context = useMemo<AppShellContextValue>(
    () => ({
      dashboard: data ?? null,
      dashboardError: error instanceof Error ? error.message : undefined,
      isDashboardLoading: isLoading,
      realtimeState,
      realtimeDetails,
      apiUrl: getApiUrl(),
      refreshDashboard: async () => mutate(),
    }),
    [data, error, isLoading, mutate, realtimeDetails, realtimeState],
  );

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <nav className="panel p-3">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-slate-950/40 p-1">
            <NavLink
              to="/results"
              className={(state) =>
                `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${navClass(state)}`
              }
            >
              <BarChart3 className="h-4 w-4" />
              Results
            </NavLink>
            <NavLink
              to="/strategies"
              className={(state) =>
                `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${navClass(state)}`
              }
            >
              <Layers3 className="h-4 w-4" />
              Strategies
            </NavLink>
            <NavLink
              to="/bots"
              className={(state) =>
                `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${navClass(state)}`
              }
            >
              <Bot className="h-4 w-4" />
              Bots
            </NavLink>
            <NavLink
              to="/accounts"
              className={(state) =>
                `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${navClass(state)}`
              }
            >
              <KeyRound className="h-4 w-4" />
              Accounts
            </NavLink>
            <NavLink
              to="/trade-analysis"
              className={(state) =>
                `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${navClass(state)}`
              }
            >
              <CandlestickChart className="h-4 w-4" />
              Trade Analysis
            </NavLink>
          </div>
        </nav>

        <Outlet context={context} />
      </div>
    </div>
  );
}

export function useAppShellData() {
  return useOutletContext<AppShellContextValue>();
}
