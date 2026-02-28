import { type ReactNode, useId } from "react";
import { cn } from "./lib/cn.js";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  className,
}: SwitchProps) {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-slate-950/40 p-4",
        className,
      )}
    >
      <div className="min-w-0">
        {label ? (
          <p id={labelId} className="text-sm font-medium text-slate-100">
            {label}
          </p>
        ) : null}
        {description ? (
          <p id={descriptionId} className="mt-1 text-xs text-slate-400">
            {description}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? labelId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onChange(!checked);
        }}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-cyan-300/40 disabled:cursor-not-allowed disabled:opacity-50",
          checked
            ? "border-emerald-300/30 bg-emerald-400/25"
            : "border-white/10 bg-white/10",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}
