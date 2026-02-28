import type { ReactNode } from "react";
import { cn } from "./lib/cn.js";

export interface BadgeProps {
  children: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warning" | "info";
  dot?: boolean;
  className?: string;
}

const toneClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "border-white/10 bg-white/5 text-slate-200",
  positive: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  negative: "border-rose-300/30 bg-rose-400/10 text-rose-100",
  warning: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  info: "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
};

const dotClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-slate-300",
  positive: "bg-emerald-300",
  negative: "bg-rose-300",
  warning: "bg-amber-300",
  info: "bg-cyan-300",
};

export function Badge({ children, tone = "neutral", dot = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[tone])} /> : null}
      {children}
    </span>
  );
}

export interface BadgeListItem {
  id: string;
  label: ReactNode;
  tone?: BadgeProps["tone"];
}

export interface BadgeListProps {
  items: BadgeListItem[];
  emptyMessage?: ReactNode;
}

export function BadgeList({ items, emptyMessage = "No items" }: BadgeListProps) {
  if (items.length === 0) {
    return <p className="text-slate-400">{emptyMessage}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Badge tone={item.tone} dot>
            {item.label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
