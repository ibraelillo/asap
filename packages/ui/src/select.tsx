import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import type { ComponentType, ReactNode } from "react";
import { CheckIcon, ChevronDownIcon } from "./icons.js";
import { cn } from "./lib/cn.js";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  value?: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  emptyState?: ReactNode;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  disabled = false,
  className,
  buttonClassName,
  emptyState = "No options available",
}: SelectProps<T>) {
  const selectedOption = options.find((option) => option.value === value);
  const isDisabled = disabled || options.length === 0;
  const ListboxRoot = Listbox as unknown as ComponentType<{
    value?: SelectOption<T>;
    onChange: (option: SelectOption<T>) => void;
    disabled?: boolean;
    children: ReactNode;
  }>;

  return (
    <ListboxRoot
      value={selectedOption}
      onChange={(option: SelectOption<T>) => onChange(option.value)}
      disabled={isDisabled}
    >
      <div className={cn("relative", className)}>
        <ListboxButton
          className={cn(
            "flex w-full items-center justify-between rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-left text-slate-100 outline-none transition focus:border-cyan-300/40 focus:bg-slate-950/80 disabled:cursor-not-allowed disabled:opacity-60",
            buttonClassName,
          )}
        >
          <span className={cn("block truncate", !selectedOption && "text-slate-500")}>
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronDownIcon className="h-4 w-4 text-slate-400" />
        </ListboxButton>

        <ListboxOptions
          anchor="bottom start"
          className="z-50 mt-2 max-h-80 w-[var(--button-width)] min-w-[14rem] overflow-auto rounded-2xl border border-white/10 bg-slate-950/95 p-1 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.85)] backdrop-blur-xl [--anchor-gap:0.5rem]"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">{emptyState}</div>
          ) : (
            options.map((option) => (
              <ListboxOption
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
              </ListboxOption>
            ))
          )}
        </ListboxOptions>
      </div>
    </ListboxRoot>
  );
}
