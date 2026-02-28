import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: string;
  description?: string;
  aside?: ReactNode;
}

export function SectionHeader({ title, description, aside }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        {description ? <p className="text-xs text-slate-400">{description}</p> : null}
      </div>
      {aside}
    </div>
  );
}
