import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { DayPicker } from "react-day-picker";
import type { ReactNode } from "react";
import { Button } from "./button.js";
import { CalendarIcon } from "./icons.js";
import { cn } from "./lib/cn.js";

export interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  fromDate?: string;
  toDate?: string;
  footer?: ReactNode;
}

function parseDateInput(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }

  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) {
    return undefined;
  }

  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: string | undefined): string | undefined {
  const date = parseDateInput(value);
  if (!date) return undefined;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  className,
  buttonClassName,
  fromDate,
  toDate,
  footer,
}: DatePickerProps) {
  const selectedDate = parseDateInput(value);
  const minDate = parseDateInput(fromDate);
  const maxDate = parseDateInput(toDate);
  const displayValue = formatDisplayDate(value);

  return (
    <Popover className={cn("relative", className)}>
      {({ close }) => (
        <>
          <PopoverButton
            disabled={disabled}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-left text-slate-100 outline-none transition focus:border-cyan-300/40 focus:bg-slate-950/80 disabled:cursor-not-allowed disabled:opacity-60",
              buttonClassName,
            )}
          >
            <span className={cn("truncate", !displayValue && "text-slate-500")}>
              {displayValue ?? placeholder}
            </span>
            <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
          </PopoverButton>

          <PopoverPanel
            anchor="bottom start"
            className="z-50 mt-2 rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.85)] backdrop-blur-xl [--anchor-gap:0.5rem]"
          >
            <DayPicker
              animate
              mode="single"
              selected={selectedDate}
              onSelect={(nextDate) => {
                if (!nextDate) return;
                onChange(toDateInputValue(nextDate));
                close();
              }}
              fromDate={minDate}
              toDate={maxDate}
              showOutsideDays
              fixedWeeks
              className="text-sm text-slate-100"
              classNames={{
                months: "flex flex-col",
                month: "space-y-3",
                caption:
                  "relative flex items-center justify-center px-8 text-sm font-medium text-slate-100",
                caption_label: "text-sm font-medium text-slate-100",
                nav: "flex items-center gap-1",
                button_previous:
                  "absolute left-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10",
                button_next:
                  "absolute right-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10",
                month_grid: "w-full border-collapse",
                weekdays: "grid grid-cols-7 gap-1",
                weekday:
                  "flex h-8 items-center justify-center text-[11px] uppercase tracking-[0.18em] text-slate-500",
                week: "mt-1 grid grid-cols-7 gap-1",
                day: "flex items-center justify-center",
                day_button:
                  "flex h-9 w-9 items-center justify-center rounded-xl text-sm text-slate-200 transition hover:bg-white/10 aria-selected:bg-cyan-400/20 aria-selected:text-cyan-50",
                selected: "bg-cyan-400/20 text-cyan-50",
                today:
                  "border border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
                outside: "text-slate-600",
                disabled: "cursor-not-allowed opacity-30",
                hidden: "invisible",
              }}
            />

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
              <Button
                size="sm"
                onClick={() => {
                  const today = new Date();
                  onChange(toDateInputValue(today));
                  close();
                }}
              >
                Today
              </Button>
              {footer}
            </div>
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}
