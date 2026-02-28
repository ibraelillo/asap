import type { ReactNode } from "react";
import { cn } from "./lib/cn.js";

export interface FieldProps {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({ label, description, error, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1 text-sm text-slate-300", className)}>
      {label ? <span>{label}</span> : null}
      {children}
      {description ? <span className="text-xs text-slate-400">{description}</span> : null}
      {error ? <span className="text-xs text-rose-300">{error}</span> : null}
    </div>
  );
}
