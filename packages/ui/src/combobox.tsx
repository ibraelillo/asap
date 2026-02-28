import {
  Combobox as HeadlessCombobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "./icons.js";
import { cn } from "./lib/cn.js";
import type { SelectOption } from "./select.js";

export interface ComboboxProps<T extends string = string> {
  value?: T;
  onChange: (value: T | undefined) => void;
  options: readonly SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyState?: string;
  searchPlaceholder?: string;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function Combobox<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Search...",
  disabled = false,
  className,
  emptyState = "No matches found",
}: ComboboxProps<T>) {
  const [query, setQuery] = useState("");
  const selectedOption =
    options.find((option) => option.value === value) ?? null;
  const normalizedQuery = normalizeSearch(query);
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) => {
      const haystack = [option.label, option.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, options]);
  const ComboboxRoot = HeadlessCombobox as unknown as ComponentType<{
    value: SelectOption<T> | null;
    onChange: (option: SelectOption<T> | null) => void;
    disabled?: boolean;
    children: ReactNode;
  }>;

  return (
    <ComboboxRoot
      value={selectedOption ?? null}
      onChange={(option) => {
        const selected = option as SelectOption<T> | null;
        setQuery("");
        onChange(selected?.value);
      }}
      disabled={disabled}
    >
      <div className={cn("relative", className)}>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-slate-100 transition focus-within:border-cyan-300/40 focus-within:bg-slate-950/80">
          <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <ComboboxInput
            className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            placeholder={placeholder}
            displayValue={(option: SelectOption<T> | null) =>
              option?.label ?? ""
            }
            onChange={(event) => setQuery(event.target.value)}
          />
          <ComboboxButton className="rounded p-0.5 text-slate-400 transition hover:text-slate-200">
            <ChevronDownIcon className="h-4 w-4" />
          </ComboboxButton>
        </div>

        <ComboboxOptions
          anchor="bottom start"
          className="z-50 mt-2 max-h-80 w-[var(--input-width)] min-w-[16rem] overflow-auto rounded-2xl border border-white/10 bg-slate-950/95 p-1 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.85)] backdrop-blur-xl [--anchor-gap:0.5rem]"
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">{emptyState}</div>
          ) : (
            filteredOptions.map((option) => (
              <ComboboxOption
                key={option.value}
                value={option}
                disabled={option.disabled}
                className="group flex cursor-default items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-200 outline-none transition data-[focus]:bg-cyan-400/12 data-[focus]:text-cyan-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
              >
                <div>
                  <div className="font-medium">{option.label}</div>
                  {option.description ? (
                    <div className="text-xs text-slate-400 group-data-[focus]:text-cyan-100/70">
                      {option.description}
                    </div>
                  ) : null}
                </div>
                <CheckIcon className="hidden h-4 w-4 text-cyan-300 group-data-[selected]:block" />
              </ComboboxOption>
            ))
          )}
        </ComboboxOptions>
      </div>
    </ComboboxRoot>
  );
}
