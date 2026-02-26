import { useMemo, useState, type ChangeEvent } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChartSpline,
  Download,
  RefreshCw,
  Upload,
} from "lucide-react";
import { mockTradeResults } from "../data/mockTradeResults";
import {
  computeMetrics,
  computeSymbolBreakdown,
  formatCurrency,
  formatPercent,
  normalizePayload,
  parsePayloadText,
} from "../lib/trade-results";
import { MetricCard } from "./trade-results/MetricCard";
import { EquityChart } from "./trade-results/EquityChart";
import { SymbolBreakdownGrid } from "./trade-results/SymbolBreakdown";
import { TradeTable } from "./trade-results/TradeTable";
import type { TradePayload } from "../types/trade-results";

const storageKey = "asap.trade-results.payload";

function loadInitialPayload(): TradePayload {
  if (typeof window === "undefined") {
    return normalizePayload(mockTradeResults);
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return normalizePayload(mockTradeResults);
  }

  try {
    return normalizePayload(JSON.parse(raw));
  } catch {
    return normalizePayload(mockTradeResults);
  }
}

export function TradeResultsDashboard() {
  const [payload, setPayload] = useState<TradePayload>(() => loadInitialPayload());
  const [jsonInput, setJsonInput] = useState("");
  const [importError, setImportError] = useState("");

  const metrics = useMemo(() => computeMetrics(payload), [payload]);
  const symbolBreakdown = useMemo(() => computeSymbolBreakdown(payload.trades), [payload.trades]);

  const handleImportJson = () => {
    try {
      const next = parsePayloadText(jsonInput);
      setPayload(next);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setImportError("");
    } catch {
      setImportError("Invalid JSON format. Use a trades array or a payload with trades/equityCurve.");
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const next = parsePayloadText(content);
      setPayload(next);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setImportError("");
    } catch {
      setImportError("Could not parse file. Make sure it contains valid trade result JSON.");
    } finally {
      event.target.value = "";
    }
  };

  const handleLoadSample = () => {
    const sample = normalizePayload(mockTradeResults);
    setPayload(sample);
    window.localStorage.setItem(storageKey, JSON.stringify(sample));
    setImportError("");
  };

  const handleClearSaved = () => {
    window.localStorage.removeItem(storageKey);
    const sample = normalizePayload(mockTradeResults);
    setPayload(sample);
    setJsonInput("");
    setImportError("");
  };

  const downloadablePayload = JSON.stringify(payload, null, 2);

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="panel p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Asap Analytics</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-100">Trade Results Control Room</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300/90">
                Monitor your bot execution quality, equity curve behavior, and per-symbol edge in one place.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleLoadSample}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
                Load Sample
              </button>
              <button
                onClick={handleClearSaved}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
              >
                Reset
              </button>
              <a
                href={`data:application/json;charset=utf-8,${encodeURIComponent(downloadablePayload)}`}
                download="trade-results.json"
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/20"
              >
                <Download className="h-4 w-4" />
                Export JSON
              </a>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Total Trades"
            value={String(metrics.totalTrades)}
            icon={<Activity className="h-5 w-5" />}
            hint={`${metrics.wins} wins / ${metrics.losses} losses`}
          />
          <MetricCard
            label="Net PnL"
            value={formatCurrency(metrics.netPnl)}
            tone={metrics.netPnl >= 0 ? "positive" : "negative"}
            icon={metrics.netPnl >= 0 ? <ArrowUp className="h-5 w-5" /> : <ArrowDown className="h-5 w-5" />}
          />
          <MetricCard
            label="Win Rate"
            value={formatPercent(metrics.winRate)}
            tone={metrics.winRate >= 0.5 ? "positive" : "negative"}
            icon={<ChartSpline className="h-5 w-5" />}
          />
          <MetricCard
            label="Profit Factor"
            value={metrics.profitFactor.toFixed(2)}
            tone={metrics.profitFactor >= 1 ? "positive" : "negative"}
            hint={`Avg win ${formatCurrency(metrics.avgWin)} / Avg loss ${formatCurrency(metrics.avgLoss)}`}
          />
          <MetricCard
            label="Max Drawdown"
            value={formatPercent(metrics.maxDrawdownPct)}
            tone={metrics.maxDrawdownPct <= 0.08 ? "positive" : "negative"}
            hint={`Ending equity ${formatCurrency(metrics.endingEquity)}`}
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
          <EquityChart curve={payload.equityCurve ?? []} trades={payload.trades} />

          <div className="panel p-5">
            <h3 className="text-lg font-semibold text-slate-100">Import Trade Data</h3>
            <p className="mt-1 text-xs text-slate-400">
              Paste JSON or upload file. Supports `trades[]` array or payload with `trades` + optional `equityCurve`.
            </p>

            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10">
              <Upload className="h-4 w-4" />
              Upload JSON
              <input type="file" accept="application/json" className="hidden" onChange={handleFileUpload} />
            </label>

            <textarea
              value={jsonInput}
              onChange={(event) => setJsonInput(event.target.value)}
              placeholder='{"trades": [...]}'
              className="mt-4 h-44 w-full rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-200 outline-none focus:border-cyan-400"
            />

            {importError ? <p className="mt-2 text-xs text-rose-300">{importError}</p> : null}

            <button
              onClick={handleImportJson}
              className="mt-3 w-full rounded-xl bg-cyan-400/90 px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-cyan-300"
            >
              Apply JSON
            </button>
          </div>
        </section>

        <SymbolBreakdownGrid rows={symbolBreakdown} />

        <TradeTable trades={payload.trades} />
      </div>
    </div>
  );
}
