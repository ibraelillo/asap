import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { CircleDashed, Crosshair, List, RefreshCw } from "lucide-react";
import { fetchTradeAnalysis } from "../../lib/ranging-api";
import type {
  DashboardPayload,
  TradeAnalysisPayload,
  TradeSignalRecord,
} from "../../types/ranging-dashboard";
import { TradeAnalysisChart } from "./TradeAnalysisChart";

interface TradeAnalysisPageProps {
  data: DashboardPayload | null;
}

function formatDateTime(value?: number): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPrice(value?: number): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function buildTpRecap(
  analysis: TradeAnalysisPayload,
  positionNotionalUsd: number,
) {
  const entryPrice = analysis.trade.price ?? analysis.run.price;
  const tp1Price = analysis.run.rangePoc;
  const side = analysis.trade.side;

  const preferredTp2 =
    side === "long" ? analysis.run.rangeVah : analysis.run.rangeVal;
  const fallbackTp2 =
    side === "long" ? analysis.run.rangeVal : analysis.run.rangeVah;
  const tp2Price = preferredTp2 ?? fallbackTp2;

  const tp2Label =
    side === "long"
      ? typeof analysis.run.rangeVah === "number"
        ? "VAH"
        : "VAL"
      : typeof analysis.run.rangeVal === "number"
        ? "VAL"
        : "VAH";

  if (
    typeof entryPrice !== "number" ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    typeof tp1Price !== "number" ||
    typeof tp2Price !== "number"
  ) {
    return null;
  }

  const tp1Ratio = 0.5;
  const tp2Ratio = 0.5;

  const totalQty = positionNotionalUsd / entryPrice;
  const tp1Qty = totalQty * tp1Ratio;
  const tp2Qty = totalQty * tp2Ratio;
  const tp1Usd = positionNotionalUsd * tp1Ratio;
  const tp2Usd = positionNotionalUsd * tp2Ratio;

  const calcPnl = (targetPrice: number, qty: number): number =>
    side === "long"
      ? (targetPrice - entryPrice) * qty
      : (entryPrice - targetPrice) * qty;

  const tp1Pnl = calcPnl(tp1Price, tp1Qty);
  const tp2Pnl = calcPnl(tp2Price, tp2Qty);
  const lockedGainAtTp2 = tp1Pnl + tp2Pnl;

  return {
    entryPrice,
    tp1Price,
    tp2Price,
    tp2Label,
    tp1Qty,
    tp2Qty,
    tp1Usd,
    tp2Usd,
    tp1Pnl,
    tp2Pnl,
    lockedGainAtTp2,
    lockedGainPct: (lockedGainAtTp2 / positionNotionalUsd) * 100,
  };
}

export function TradeAnalysisPage({ data }: TradeAnalysisPageProps) {
  const trades = data?.trades ?? [];
  const [selectedTradeId, setSelectedTradeId] = useState<string | undefined>(
    undefined,
  );
  const [barsBefore, setBarsBefore] = useState<number>(80);
  const [barsAfter, setBarsAfter] = useState<number>(80);
  const [positionNotionalUsd, setPositionNotionalUsd] = useState<number>(() => {
    const parsed = Number(
      import.meta.env.VITE_RANGING_DEFAULT_POSITION_USD ?? 30,
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  });

  useEffect(() => {
    if (trades.length === 0) {
      setSelectedTradeId(undefined);
      return;
    }

    const exists = trades.some((trade) => trade.id === selectedTradeId);
    if (!selectedTradeId || !exists) {
      setSelectedTradeId(trades[0]?.id);
    }
  }, [selectedTradeId, trades]);

  const selectedTrade = useMemo(() => {
    if (!selectedTradeId) return undefined;
    return trades.find((trade) => trade.id === selectedTradeId);
  }, [selectedTradeId, trades]);

  const {
    data: analysis,
    isLoading,
    error,
    mutate,
  } = useSWR(
    selectedTradeId
      ? ["trade-analysis", selectedTradeId, barsBefore, barsAfter]
      : null,
    ([, tradeId, before, after]) =>
      fetchTradeAnalysis(String(tradeId), {
        barsBefore: Number(before),
        barsAfter: Number(after),
      }),
    {
      revalidateOnFocus: false,
    },
  );

  const tpRecap = useMemo(
    () => (analysis ? buildTpRecap(analysis, positionNotionalUsd) : null),
    [analysis, positionNotionalUsd],
  );

  if (trades.length === 0) {
    return (
      <div className="panel p-6">
        <h2 className="text-xl font-semibold text-slate-100">Trade Analysis</h2>
        <p className="mt-2 text-sm text-slate-400">
          No trade signals available yet. Wait for new signals to analyze.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
              Ranging Bot
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              Trade Analysis
            </h1>
            <p className="mt-2 text-sm text-slate-300/90">
              Inspect one trade with related candles and contextual levels
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200">
              Position USD
              <input
                type="number"
                min={1}
                value={positionNotionalUsd}
                onChange={(event) =>
                  setPositionNotionalUsd(
                    Math.max(1, Number(event.target.value) || 30),
                  )
                }
                className="w-20 rounded bg-slate-950/50 px-2 py-1 text-right outline-none"
              />
            </label>

            <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200">
              Bars Before
              <input
                type="number"
                min={10}
                max={300}
                value={barsBefore}
                onChange={(event) =>
                  setBarsBefore(
                    Math.max(
                      10,
                      Math.min(300, Number(event.target.value) || 80),
                    ),
                  )
                }
                className="w-16 rounded bg-slate-950/50 px-2 py-1 text-right outline-none"
              />
            </label>

            <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200">
              Bars After
              <input
                type="number"
                min={10}
                max={300}
                value={barsAfter}
                onChange={(event) =>
                  setBarsAfter(
                    Math.max(
                      10,
                      Math.min(300, Number(event.target.value) || 80),
                    ),
                  )
                }
                className="w-16 rounded bg-slate-950/50 px-2 py-1 text-right outline-none"
              />
            </label>

            <button
              onClick={() => {
                void mutate();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
              <List className="h-4 w-4 text-cyan-300" />
              Trades
            </h3>
            <p className="text-xs text-slate-400">{trades.length}</p>
          </div>

          <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
            {trades.map((trade: TradeSignalRecord) => {
              const active = trade.id === selectedTradeId;
              const sideTone =
                trade.side === "long" ? "text-emerald-300" : "text-amber-300";

              return (
                <button
                  key={trade.id}
                  onClick={() => setSelectedTradeId(trade.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? "border-cyan-300/40 bg-cyan-400/10"
                      : "border-white/10 bg-slate-950/40 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-100">{trade.symbol}</p>
                    <span className={`text-xs font-medium ${sideTone}`}>
                      {trade.side}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateTime(trade.generatedAtMs)}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    {trade.processingStatus}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {!selectedTradeId || isLoading ? (
            <div className="panel flex h-[460px] items-center justify-center">
              <div className="text-center">
                <CircleDashed className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
                <p className="mt-3 text-sm text-slate-300">
                  Loading trade context...
                </p>
              </div>
            </div>
          ) : error || !analysis ? (
            <div className="panel p-5">
              <p className="text-sm text-rose-300">
                Failed to load trade analysis.
              </p>
              <p className="mt-2 text-xs text-slate-400 mono">
                {error instanceof Error ? error.message : "Unknown API error"}
              </p>
            </div>
          ) : (
            <>
              <div className="panel p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-400">Trade</p>
                    <p className="mt-1 font-medium text-slate-100">
                      {analysis.trade.symbol}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Side</p>
                    <p
                      className={`mt-1 font-medium ${analysis.trade.side === "long" ? "text-emerald-300" : "text-amber-300"}`}
                    >
                      {analysis.trade.side}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Signal Time</p>
                    <p className="mt-1 text-sm text-slate-200">
                      {formatDateTime(analysis.trade.generatedAtMs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Processing</p>
                    <p className="mt-1 text-sm text-slate-200">
                      {analysis.trade.processingStatus}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/45 p-3 text-xs text-slate-300">
                  <p>
                    <Crosshair className="mr-1 inline h-3.5 w-3.5 text-cyan-300" />
                    Reasons: {analysis.trade.reasons.join(", ")}
                  </p>
                  <p className="mt-1">
                    Order ID: {analysis.trade.orderId ?? "-"}
                  </p>
                  <p className="mt-1">
                    Range: VAL {analysis.run.rangeVal?.toLocaleString() ?? "-"}{" "}
                    | POC {analysis.run.rangePoc?.toLocaleString() ?? "-"} | VAH{" "}
                    {analysis.run.rangeVah?.toLocaleString() ?? "-"}
                  </p>
                </div>

                <div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3 text-xs text-slate-200">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-300/90">
                    TP Recap
                  </p>
                  {tpRecap ? (
                    <>
                      <p className="mt-2">
                        Entry {formatPrice(tpRecap.entryPrice)} | TP1 (POC){" "}
                        {formatPrice(tpRecap.tp1Price)} | TP2 (
                        {tpRecap.tp2Label}) {formatPrice(tpRecap.tp2Price)}
                      </p>
                      <p className="mt-1">
                        TP1 50% = {formatUsd(tpRecap.tp1Usd)} (qty{" "}
                        {tpRecap.tp1Qty.toFixed(6)}) | est. PnL{" "}
                        {formatUsd(tpRecap.tp1Pnl)}
                      </p>
                      <p className="mt-1">
                        TP2 50% = {formatUsd(tpRecap.tp2Usd)} (qty{" "}
                        {tpRecap.tp2Qty.toFixed(6)}) | est. PnL{" "}
                        {formatUsd(tpRecap.tp2Pnl)}
                      </p>
                      <p className="mt-2 font-medium text-emerald-300">
                        Estimated locked gain at TP2:{" "}
                        {formatUsd(tpRecap.lockedGainAtTp2)} (
                        {tpRecap.lockedGainPct.toFixed(2)}%)
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-slate-400">
                      TP recap unavailable for this trade (missing entry or
                      range levels).
                    </p>
                  )}
                </div>
              </div>

              <TradeAnalysisChart analysis={analysis} />
            </>
          )}
        </div>
      </section>

      {selectedTrade ? (
        <p className="text-xs text-slate-400 mono">
          Selected Trade ID: {selectedTrade.id}
        </p>
      ) : null}
    </div>
  );
}
