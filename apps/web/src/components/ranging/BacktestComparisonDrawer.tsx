import { Drawer, Panel } from "@repo/ui";
import type {
  BacktestRecord,
  StrategyConfigUiField,
  StrategySummary,
} from "../../types/ranging-dashboard";
import { asRecord, mergeConfigDefaults } from "./config-utils";
import { formatCurrency, formatDateTime } from "./BotUi";

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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

interface BacktestComparisonDrawerProps {
  open: boolean;
  onClose: () => void;
  strategy?: StrategySummary;
  currentBotConfig: Record<string, unknown>;
  backtests: BacktestRecord[];
}

export function BacktestComparisonDrawer({
  open,
  onClose,
  strategy,
  currentBotConfig,
  backtests,
}: BacktestComparisonDrawerProps) {
  const defaults = asRecord(strategy?.configDefaults);
  const botConfig = mergeConfigDefaults(defaults, asRecord(currentBotConfig));
  const comparedBacktests = backtests.map((backtest) => ({
    ...backtest,
    effectiveConfig: mergeConfigDefaults(
      defaults,
      asRecord(backtest.strategyConfig),
    ),
  }));

  const configUiByPath = new Map(
    (strategy?.configUi ?? []).map((field) => [field.path, field]),
  );
  const rows = [
    ...collectConfigPaths(botConfig),
    ...comparedBacktests.flatMap((backtest) => [
      ...collectConfigPaths(backtest.effectiveConfig),
    ]),
  ]
    .filter((path, index, array) => array.indexOf(path) === index)
    .map((path) => ({
      path,
      field: configUiByPath.get(path),
      botValue: getValueAtPath(botConfig, path),
      backtestValues: comparedBacktests.map((backtest) =>
        getValueAtPath(backtest.effectiveConfig, path),
      ),
    }))
    .sort((left, right) => {
      const leftOrder = left.field?.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.field?.order ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.path.localeCompare(right.path);
    });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Compare Backtests"
      description="Review key performance metrics and strategy parameter variants side by side before you rerun another experiment."
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Panel className="space-y-2 p-4" tone="muted">
            <p className="text-sm font-medium text-slate-100">
              Current Bot Config
            </p>
            <p className="text-xs text-slate-400">
              Live defaults currently applied to the bot.
            </p>
          </Panel>
          {comparedBacktests.map((backtest) => (
            <Panel key={backtest.id} className="space-y-3 p-4" tone="muted">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {backtest.id}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDateTime(backtest.createdAtMs)}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-200">
                  {backtest.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-400">Net PnL</p>
                  <p
                    className={
                      backtest.netPnl >= 0 ? "text-emerald-200" : "text-rose-200"
                    }
                  >
                    {formatCurrency(backtest.netPnl)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Win Rate</p>
                  <p className="text-slate-200">
                    {(backtest.winRate * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Trades</p>
                  <p className="text-slate-200">{backtest.totalTrades}</p>
                </div>
                <div>
                  <p className="text-slate-400">Max DD</p>
                  <p className="text-slate-200">
                    {(backtest.maxDrawdownPct * 100).toFixed(2)}%
                  </p>
                </div>
              </div>
            </Panel>
          ))}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Field</th>
                <th className="px-4 py-3">Current Bot</th>
                {comparedBacktests.map((backtest) => (
                  <th key={backtest.id} className="px-4 py-3">
                    {backtest.id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const botValueKey = stableStringify(row.botValue);
                const allValues = [botValueKey, ...row.backtestValues.map(stableStringify)];
                const differs = new Set(allValues).size > 1;

                return (
                  <tr
                    key={row.path}
                    className="border-t border-white/5 align-top text-slate-200"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">
                          {row.field?.label ?? labelFromPath(row.path)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {row.field?.description ?? row.path}
                        </p>
                      </div>
                    </td>
                    <td
                      className={
                        differs
                          ? "px-4 py-3 text-cyan-100"
                          : "px-4 py-3 text-slate-200"
                      }
                    >
                      {formatConfigValue(
                        row.botValue,
                        row.field as StrategyConfigUiField | undefined,
                      )}
                    </td>
                    {row.backtestValues.map((value, index) => (
                      <td
                        key={`${row.path}-${comparedBacktests[index]?.id ?? index}`}
                        className={
                          differs
                            ? "px-4 py-3 text-cyan-100"
                            : "px-4 py-3 text-slate-200"
                        }
                      >
                        {formatConfigValue(
                          value,
                          row.field as StrategyConfigUiField | undefined,
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Drawer>
  );
}
