import { useEffect, useRef, useState } from "react";
import { Button, DatePicker, Drawer } from "@repo/ui";
import {
  createBacktest,
  type CreateBacktestRequest,
} from "../../lib/ranging-api";
import type { BacktestRecord, StrategySummary } from "../../types/ranging-dashboard";
import {
  StrategyConfigEditor,
  type StrategyConfigEditorHandle,
} from "./StrategyConfigEditor";

interface BacktestConfigSeed {
  strategyConfig?: Record<string, unknown>;
  fromMs?: number;
  toMs?: number;
  initialEquity?: number;
  ai?: CreateBacktestRequest["ai"];
}

interface BacktestConfigDrawerProps {
  open: boolean;
  onClose(): void;
  botId: string;
  symbol: string;
  strategy?: StrategySummary;
  seedKey: string;
  seed: BacktestConfigSeed;
  title: string;
  description: string;
  onCreated(backtest: BacktestRecord): Promise<void> | void;
}

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

function toDateInputFromMs(value: number | undefined, fallbackDaysAgo: number) {
  if (!value || !Number.isFinite(value)) return dateInputDaysAgo(fallbackDaysAgo);
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return toDateInputValue(date);
}

function parseDateStartMs(value: string): number | undefined {
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }

  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) {
    return undefined;
  }

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDateEndMs(value: string): number | undefined {
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }

  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) {
    return undefined;
  }

  const parsed = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function cloneRecord<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function BacktestConfigDrawer({
  open,
  onClose,
  botId,
  symbol,
  strategy,
  seedKey,
  seed,
  title,
  description,
  onCreated,
}: BacktestConfigDrawerProps) {
  const strategyConfigEditorRef = useRef<StrategyConfigEditorHandle>(null);
  const [draftStrategyConfig, setDraftStrategyConfig] = useState<
    Record<string, unknown>
  >({});
  const [fromDate, setFromDate] = useState<string>(() => dateInputDaysAgo(30));
  const [toDate, setToDate] = useState<string>(() => dateInputDaysAgo(0));
  const [initialEquity, setInitialEquity] = useState<number>(1000);
  const [useAi, setUseAi] = useState<boolean>(false);
  const [aiLookbackCandles, setAiLookbackCandles] = useState<number>(240);
  const [aiCadenceBars, setAiCadenceBars] = useState<number>(1);
  const [aiMaxEvaluations, setAiMaxEvaluations] = useState<number>(50);
  const [aiConfidenceThreshold, setAiConfidenceThreshold] =
    useState<number>(0.72);
  const [feedback, setFeedback] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;

    setDraftStrategyConfig(cloneRecord(asRecord(seed.strategyConfig)));
    strategyConfigEditorRef.current?.resetDrafts();
    setFromDate(toDateInputFromMs(seed.fromMs, 30));
    setToDate(toDateInputFromMs(seed.toMs, 0));
    setInitialEquity(
      typeof seed.initialEquity === "number" && Number.isFinite(seed.initialEquity)
        ? Math.max(100, seed.initialEquity)
        : 1000,
    );
    setUseAi(Boolean(seed.ai?.enabled));
    setAiLookbackCandles(
      typeof seed.ai?.lookbackCandles === "number"
        ? seed.ai.lookbackCandles
        : 240,
    );
    setAiCadenceBars(
      typeof seed.ai?.cadenceBars === "number" ? seed.ai.cadenceBars : 1,
    );
    setAiMaxEvaluations(
      typeof seed.ai?.maxEvaluations === "number" ? seed.ai.maxEvaluations : 50,
    );
    setAiConfidenceThreshold(
      typeof seed.ai?.confidenceThreshold === "number"
        ? seed.ai.confidenceThreshold
        : 0.72,
    );
    setFeedback(undefined);
  }, [open, seedKey]);

  async function queueBacktest() {
    if (creating) return;

    const fromMs = parseDateStartMs(fromDate);
    const toMs = parseDateEndMs(toDate);
    if (!fromMs || !toMs) {
      setFeedback("Select a valid start and end date.");
      return;
    }
    if (fromMs >= toMs) {
      setFeedback("The start date must be before the end date.");
      return;
    }

    const resolved = strategyConfigEditorRef.current?.resolveForSubmit() ?? {
      valid: true,
      config: asRecord(draftStrategyConfig),
    };
    if (!resolved.valid) {
      setFeedback(
        "Fix the highlighted strategy parameters before queuing the backtest.",
      );
      return;
    }

    setCreating(true);
    setFeedback(undefined);

    try {
      setDraftStrategyConfig(cloneRecord(resolved.config));
      const backtest = await createBacktest(botId, {
        fromMs,
        toMs,
        initialEquity,
        strategyConfig: resolved.config,
        ai: {
          enabled: useAi,
          lookbackCandles: aiLookbackCandles,
          cadenceBars: aiCadenceBars,
          maxEvaluations: aiMaxEvaluations,
          confidenceThreshold: aiConfidenceThreshold,
        },
      });

      await onCreated(backtest);
    } catch (error) {
      setFeedback(
        `Backtest request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => onClose()}
      title={title}
      description={description}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              void queueBacktest();
            }}
            disabled={creating}
          >
            {creating ? "Queueing..." : "Run Backtest"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
          <p className="font-medium text-slate-100">{symbol}</p>
          <p className="mt-1">{strategy?.label ?? strategy?.strategyId ?? "-"}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            From
            <DatePicker
              value={fromDate}
              onChange={setFromDate}
              buttonClassName="text-sm"
            />
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            To
            <DatePicker
              value={toDate}
              onChange={setToDate}
              fromDate={fromDate}
              buttonClassName="text-sm"
            />
          </label>

          <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
            Initial Equity
            <input
              type="number"
              min={100}
              value={initialEquity}
              onChange={(event) =>
                setInitialEquity(Math.max(100, Number(event.target.value) || 1000))
              }
              className="rounded bg-slate-950/60 px-3 py-2 text-right text-sm text-slate-100 outline-none"
            />
          </label>

          <label className="inline-flex h-[72px] items-end gap-2 pb-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(event) => setUseAi(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-slate-950/60 text-cyan-300"
            />
            AI range validation
          </label>
        </div>

        {useAi ? (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-white/10 bg-white/5 p-4 md:grid-cols-2">
            <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
              AI Lookback
              <input
                type="number"
                min={60}
                max={600}
                value={aiLookbackCandles}
                onChange={(event) =>
                  setAiLookbackCandles(
                    Math.max(60, Math.min(600, Number(event.target.value) || 240)),
                  )
                }
                className="rounded bg-slate-950/60 px-3 py-2 text-right text-sm text-slate-100 outline-none"
              />
            </label>
            <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
              AI Cadence
              <input
                type="number"
                min={1}
                max={24}
                value={aiCadenceBars}
                onChange={(event) =>
                  setAiCadenceBars(
                    Math.max(1, Math.min(24, Number(event.target.value) || 1)),
                  )
                }
                className="rounded bg-slate-950/60 px-3 py-2 text-right text-sm text-slate-100 outline-none"
              />
            </label>
            <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
              AI Max Calls
              <input
                type="number"
                min={1}
                max={400}
                value={aiMaxEvaluations}
                onChange={(event) =>
                  setAiMaxEvaluations(
                    Math.max(1, Math.min(400, Number(event.target.value) || 50)),
                  )
                }
                className="rounded bg-slate-950/60 px-3 py-2 text-right text-sm text-slate-100 outline-none"
              />
            </label>
            <label className="inline-flex flex-col gap-1 text-xs text-slate-300">
              AI Min Conf
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={aiConfidenceThreshold}
                onChange={(event) =>
                  setAiConfidenceThreshold(
                    Math.max(0, Math.min(1, Number(event.target.value) || 0.72)),
                  )
                }
                className="rounded bg-slate-950/60 px-3 py-2 text-right text-sm text-slate-100 outline-none"
              />
            </label>
          </div>
        ) : null}

        <StrategyConfigEditor
          ref={strategyConfigEditorRef}
          strategy={strategy}
          value={draftStrategyConfig}
          onChange={setDraftStrategyConfig}
          emptyState="No strategy metadata is available for this bot."
        />

        {feedback ? (
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
            {feedback}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
