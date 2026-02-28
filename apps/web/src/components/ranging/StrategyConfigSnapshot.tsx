import { Panel } from "@repo/ui";
import type {
  StrategyConfigUiField,
  StrategySummary,
} from "../../types/ranging-dashboard";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
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

interface StrategyConfigSnapshotProps {
  strategy?: StrategySummary;
  config: Record<string, unknown>;
  emptyMessage?: string;
}

type SnapshotRow = {
  path: string;
  field?: StrategyConfigUiField;
  value: unknown;
};

export function StrategyConfigSnapshot({
  strategy,
  config,
  emptyMessage = "No strategy snapshot was stored on this backtest.",
}: StrategyConfigSnapshotProps) {
  const normalizedConfig = asRecord(config);
  const configUiByPath = new Map(
    (strategy?.configUi ?? []).map((field) => [field.path, field]),
  );
  const rows: SnapshotRow[] = [...collectConfigPaths(normalizedConfig)]
    .map((path) => ({
      path,
      field: configUiByPath.get(path),
      value: getValueAtPath(normalizedConfig, path),
    }))
    .sort((left, right) => {
      const leftOrder = left.field?.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.field?.order ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.path.localeCompare(right.path);
    });

  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>;
  }

  const sections = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const section = row.field?.section ?? "Other";
    const existing = sections.get(section) ?? [];
    existing.push(row);
    sections.set(section, existing);
  }

  return (
    <div className="space-y-4">
      {[...sections.entries()].map(([section, sectionRows]) => (
        <Panel key={section} className="overflow-hidden p-0" tone="muted">
          <div className="border-b border-white/10 bg-white/5 px-4 py-3">
            <h4 className="text-sm font-semibold text-slate-100">{section}</h4>
            <p className="mt-1 text-xs text-slate-400">
              {sectionRows.length} parameter
              {sectionRows.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Parameter</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {sectionRows.map((entry) => (
                  <tr
                    key={entry.path}
                    className="border-t border-white/5 align-top text-slate-200"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">
                          {entry.field?.label ?? labelFromPath(entry.path)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 mono">
                          {entry.path}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-cyan-100">
                      {formatConfigValue(
                        entry.value,
                        entry.field as StrategyConfigUiField | undefined,
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {entry.field?.description ?? "No description provided."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </div>
  );
}
