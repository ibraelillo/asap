import type { ReactNode } from "react";
import { Panel } from "./panel.js";

export interface MetricCardProps {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  icon?: ReactNode;
  hint?: string;
}

const toneClassByName: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  neutral: "text-slate-100",
  positive: "text-emerald-300",
  negative: "text-rose-300",
};

export function MetricCard({
  label,
  value,
  tone = "neutral",
  icon,
  hint,
}: MetricCardProps) {
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className={`mt-2 text-2xl font-semibold ${toneClassByName[tone]}`}>{value}</p>
          {hint ? <p className="mt-2 text-xs text-slate-400">{hint}</p> : null}
        </div>
        {icon ? <div className="text-cyan-300/90">{icon}</div> : null}
      </div>
    </Panel>
  );
}
