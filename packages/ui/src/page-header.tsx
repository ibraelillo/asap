import type { ReactNode } from "react";
import { Panel } from "./panel.js";

export interface PageHeaderProps {
  kicker?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ kicker, title, description, meta, actions }: PageHeaderProps) {
  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {kicker ? (
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">{kicker}</p>
          ) : null}
          <h1 className="mt-2 text-3xl font-semibold text-slate-100">{title}</h1>
          {description ? <p className="mt-2 text-sm text-slate-300/90">{description}</p> : null}
          {meta ? <div className="mt-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </Panel>
  );
}
