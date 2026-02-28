import type { ReactNode } from "react";
import { cn } from "./lib/cn.js";

export interface CodeProps {
  children: ReactNode;
  className?: string;
}

export function Code({ children, className }: CodeProps) {
  return (
    <code
      className={cn(
        "rounded-md border border-white/10 bg-slate-950/60 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-200",
        className,
      )}
    >
      {children}
    </code>
  );
}
