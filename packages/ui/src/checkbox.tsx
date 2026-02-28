import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "./lib/cn.js";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ className, label, ...props }, ref) {
    return (
      <label
        className={cn(
          "inline-flex items-center gap-2 text-sm text-slate-300",
          className,
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          className="h-4 w-4 rounded border-white/20 bg-slate-950/60 text-cyan-300 accent-cyan-400"
          {...props}
        />
        {label}
      </label>
    );
  },
);
