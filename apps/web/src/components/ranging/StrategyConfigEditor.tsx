import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ForwardedRef,
} from "react";
import { Checkbox, Field, Input, Panel, Select } from "@repo/ui";
import type {
  StrategyConfigUiField,
  StrategySummary,
} from "../../types/ranging-dashboard";

type StrategyNumberDrafts = Record<string, string>;

export interface StrategyConfigEditorHandle {
  resolveForSubmit(): {
    valid: boolean;
    config: Record<string, unknown>;
  };
  resetDrafts(): void;
}

interface StrategyConfigEditorProps {
  strategy?: StrategySummary;
  value: Record<string, unknown>;
  onChange(nextValue: Record<string, unknown>): void;
  emptyState?: string;
  compact?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function cloneRecord<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function setValueAtPath(
  object: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const next = cloneRecord(object);
  const segments = path.split(".");
  let cursor: Record<string, unknown> = next;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const existing = cursor[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  const leaf = segments[segments.length - 1];
  if (!leaf) return next;

  if (value === undefined) {
    delete cursor[leaf];
  } else {
    cursor[leaf] = value;
  }

  return next;
}

function getSchemaNode(
  schema: Record<string, unknown>,
  path: string,
): Record<string, unknown> | undefined {
  let current: Record<string, unknown> | undefined = schema;

  for (const segment of path.split(".")) {
    const properties = current?.properties;
    if (!properties || typeof properties !== "object") return undefined;
    const next = (properties as Record<string, unknown>)[segment];
    if (!next || typeof next !== "object") return undefined;
    current = next as Record<string, unknown>;
  }

  return current;
}

function toSelectOptions(schemaNode: Record<string, unknown> | undefined) {
  const values = Array.isArray(schemaNode?.enum) ? schemaNode.enum : [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => ({ value, label: value }));
}

function labelFromPath(path: string): string {
  const leaf = path.split(".").at(-1) ?? path;
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function toStoredNumber(
  displayValue: number,
  field: StrategyConfigUiField,
): number {
  switch (field.valueFormat) {
    case "fraction-percent":
      return displayValue / 100;
    case "percent":
    case "raw":
    default:
      return displayValue;
  }
}

function toDisplayNumber(
  storedValue: number,
  field: StrategyConfigUiField,
): number {
  switch (field.valueFormat) {
    case "fraction-percent":
      return storedValue * 100;
    case "percent":
    case "raw":
    default:
      return storedValue;
  }
}

function formatNumberForInput(
  value: number,
  decimals: number | undefined,
): string {
  const fixed =
    typeof decimals === "number" ? value.toFixed(decimals) : String(value);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function getDisplayConstraint(
  schemaNode: Record<string, unknown> | undefined,
  key: "minimum" | "maximum" | "multipleOf" | "default",
  field: StrategyConfigUiField,
): number | undefined {
  const rawValue = schemaNode?.[key];
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
    return undefined;
  }

  return toDisplayNumber(rawValue, field);
}

function formatDisplayValue(
  value: number | undefined,
  field: StrategyConfigUiField,
): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;

  return `${formatNumberForInput(value, field.decimals)}${field.suffix ?? ""}`;
}

function buildNumberHint(
  field: StrategyConfigUiField,
  schemaNode: Record<string, unknown> | undefined,
): string | undefined {
  const min = getDisplayConstraint(schemaNode, "minimum", field);
  const max = getDisplayConstraint(schemaNode, "maximum", field);
  const step = getDisplayConstraint(schemaNode, "multipleOf", field);
  const defaultValue = getDisplayConstraint(schemaNode, "default", field);

  const parts = [
    min !== undefined || max !== undefined
      ? `Range ${formatDisplayValue(min, field) ?? "?"} to ${formatDisplayValue(max, field) ?? "?"}`
      : undefined,
    defaultValue !== undefined
      ? `Default ${formatDisplayValue(defaultValue, field)}`
      : undefined,
    step !== undefined ? `Step ${formatDisplayValue(step, field)}` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function parseStrategyNumberInput(rawValue: string): number | undefined {
  const normalized = rawValue.trim().replace(",", ".");
  if (normalized.length === 0) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function groupStrategyFields(
  strategy: StrategySummary | undefined,
): Array<[string, StrategyConfigUiField[]]> {
  if (!strategy) return [];

  const groups = new Map<string, StrategyConfigUiField[]>();
  const fields = [...strategy.configUi].sort(
    (left, right) =>
      (left.order ?? Number.MAX_SAFE_INTEGER) -
        (right.order ?? Number.MAX_SAFE_INTEGER) ||
      left.path.localeCompare(right.path),
  );

  for (const field of fields) {
    const section = field.section ?? "General";
    const existing = groups.get(section) ?? [];
    existing.push(field);
    groups.set(section, existing);
  }

  return [...groups.entries()];
}

export const StrategyConfigEditor = forwardRef(function StrategyConfigEditor(
  {
    strategy,
    value,
    onChange,
    emptyState = "Select a bot type to load strategy-specific parameters.",
    compact = false,
  }: StrategyConfigEditorProps,
  ref: ForwardedRef<StrategyConfigEditorHandle>,
) {
  const [numberDrafts, setNumberDrafts] = useState<StrategyNumberDrafts>({});
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string | undefined>
  >({});
  const sections = groupStrategyFields(strategy);
  const config = asRecord(value);

  useEffect(() => {
    setNumberDrafts({});
    setFieldErrors({});
  }, [strategy?.strategyId]);

  function updateNumberDraft(path: string, nextValue: string) {
    setNumberDrafts((current) => ({
      ...current,
      [path]: nextValue,
    }));
    setFieldErrors((current) => ({
      ...current,
      [path]: undefined,
    }));
  }

  function commitNumberField(
    field: StrategyConfigUiField,
    schemaNode: Record<string, unknown> | undefined,
  ): boolean {
    const rawValue = numberDrafts[field.path];
    if (rawValue === undefined) return true;

    const parsedDisplay = parseStrategyNumberInput(rawValue);
    if (parsedDisplay === undefined) {
      setFieldErrors((current) => ({
        ...current,
        [field.path]: "Enter a valid number.",
      }));
      return false;
    }

    const storedValue = toStoredNumber(parsedDisplay, field);
    const minimum = schemaNode?.minimum;
    const maximum = schemaNode?.maximum;

    if (typeof minimum === "number" && storedValue < minimum) {
      setFieldErrors((current) => ({
        ...current,
        [field.path]: `Minimum ${formatDisplayValue(toDisplayNumber(minimum, field), field)}`,
      }));
      return false;
    }

    if (typeof maximum === "number" && storedValue > maximum) {
      setFieldErrors((current) => ({
        ...current,
        [field.path]: `Maximum ${formatDisplayValue(toDisplayNumber(maximum, field), field)}`,
      }));
      return false;
    }

    onChange(setValueAtPath(config, field.path, storedValue));
    setNumberDrafts((current) => {
      const next = { ...current };
      delete next[field.path];
      return next;
    });
    setFieldErrors((current) => ({
      ...current,
      [field.path]: undefined,
    }));
    return true;
  }

  function resolveForSubmit() {
    if (!strategy) {
      return { valid: true, config };
    }

    let nextConfig = cloneRecord(config);
    const nextErrors: Record<string, string | undefined> = {};
    let valid = true;

    for (const field of strategy.configUi) {
      if (field.widget !== "number") continue;
      const draft = numberDrafts[field.path];
      if (draft === undefined) continue;

      const schemaNode = getSchemaNode(strategy.configJsonSchema, field.path);
      const parsedDisplay = parseStrategyNumberInput(draft);
      if (parsedDisplay === undefined) {
        nextErrors[field.path] = "Enter a valid number.";
        valid = false;
        continue;
      }

      const storedValue = toStoredNumber(parsedDisplay, field);
      const minimum = schemaNode?.minimum;
      const maximum = schemaNode?.maximum;

      if (typeof minimum === "number" && storedValue < minimum) {
        nextErrors[field.path] =
          `Minimum ${formatDisplayValue(toDisplayNumber(minimum, field), field)}`;
        valid = false;
        continue;
      }

      if (typeof maximum === "number" && storedValue > maximum) {
        nextErrors[field.path] =
          `Maximum ${formatDisplayValue(toDisplayNumber(maximum, field), field)}`;
        valid = false;
        continue;
      }

      nextConfig = setValueAtPath(nextConfig, field.path, storedValue);
    }

    setFieldErrors((current) => ({
      ...current,
      ...nextErrors,
    }));

    if (valid) {
      onChange(nextConfig);
      setNumberDrafts({});
    }

    return {
      valid,
      config: nextConfig,
    };
  }

  useImperativeHandle(ref, () => ({
    resolveForSubmit,
    resetDrafts() {
      setNumberDrafts({});
      setFieldErrors({});
    },
  }));

  if (!strategy) {
    return (
      <Panel className="px-4 py-3 text-sm text-slate-300" tone="muted">
        {emptyState}
      </Panel>
    );
  }

  if (sections.length === 0) {
    return (
      <Panel className="px-4 py-3 text-sm text-slate-300" tone="muted">
        This strategy exposes no configurable parameters yet.
      </Panel>
    );
  }

  return (
    <div
      className={
        compact ? "grid grid-cols-1 gap-4 xl:grid-cols-2" : "space-y-4"
      }
    >
      {sections.map(([section, fields]) => (
        <Panel key={section} className="space-y-4 p-5" tone="muted">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
              {section}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map((field) => {
              const schemaNode = getSchemaNode(
                strategy.configJsonSchema,
                field.path,
              );
              const fieldValue = getValueAtPath(config, field.path);
              const label =
                field.label ??
                (typeof schemaNode?.title === "string"
                  ? schemaNode.title
                  : labelFromPath(field.path));
              const description =
                field.description ??
                (typeof schemaNode?.description === "string"
                  ? schemaNode.description
                  : undefined);
              const numberHint =
                field.widget === "number"
                  ? buildNumberHint(field, schemaNode)
                  : undefined;

              if (field.widget === "boolean") {
                return (
                  <Field key={field.path} description={description}>
                    <Checkbox
                      checked={Boolean(fieldValue)}
                      onChange={(event) =>
                        onChange(
                          setValueAtPath(
                            config,
                            field.path,
                            event.target.checked,
                          ),
                        )
                      }
                      label={label}
                    />
                  </Field>
                );
              }

              if (field.widget === "select") {
                return (
                  <Field
                    key={field.path}
                    label={label}
                    description={description}
                  >
                    <Select
                      value={
                        typeof fieldValue === "string" ? fieldValue : undefined
                      }
                      onChange={(nextValue) =>
                        onChange(setValueAtPath(config, field.path, nextValue))
                      }
                      options={toSelectOptions(schemaNode)}
                    />
                  </Field>
                );
              }

              if (field.widget === "string-array") {
                return (
                  <Field
                    key={field.path}
                    label={label}
                    description={description}
                    className="md:col-span-2"
                  >
                    <Input
                      value={
                        Array.isArray(fieldValue)
                          ? fieldValue.join(", ")
                          : typeof fieldValue === "string"
                            ? fieldValue
                            : ""
                      }
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        onChange(
                          setValueAtPath(
                            config,
                            field.path,
                            event.target.value
                              .split(",")
                              .map((item) => item.trim())
                              .filter((item) => item.length > 0),
                          ),
                        )
                      }
                    />
                  </Field>
                );
              }

              const inputType = field.widget === "number" ? "number" : "text";

              return (
                <Field
                  key={field.path}
                  label={label}
                  description={[description, numberHint]
                    .filter(Boolean)
                    .join(" · ")}
                  error={fieldErrors[field.path]}
                >
                  {field.widget === "number" ? (
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={
                          numberDrafts[field.path] ??
                          (typeof fieldValue === "number"
                            ? formatNumberForInput(
                                toDisplayNumber(fieldValue, field),
                                field.decimals,
                              )
                            : "")
                        }
                        placeholder={
                          field.placeholder ??
                          formatDisplayValue(
                            getDisplayConstraint(schemaNode, "default", field),
                            field,
                          )?.replace(field.suffix ?? "", "")
                        }
                        className={field.suffix ? "pr-12" : undefined}
                        onChange={(event) =>
                          updateNumberDraft(field.path, event.target.value)
                        }
                        onBlur={() => commitNumberField(field, schemaNode)}
                      />
                      {field.suffix ? (
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
                          {field.suffix}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <Input
                      type={inputType}
                      value={typeof fieldValue === "string" ? fieldValue : ""}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        onChange(
                          setValueAtPath(
                            config,
                            field.path,
                            event.target.value,
                          ),
                        )
                      }
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </Panel>
      ))}
    </div>
  );
});
