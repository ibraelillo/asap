import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from "react";
import { cn } from "./lib/cn.js";

type PanelBaseProps = {
  as?: ElementType;
  tone?: "default" | "muted" | "danger" | "warning";
  className?: string;
  children?: ReactNode;
};

export type PanelProps<E extends ElementType = "div"> = PanelBaseProps &
  Omit<ComponentPropsWithoutRef<E>, keyof PanelBaseProps>;

const toneClasses: Record<NonNullable<PanelProps["tone"]>, string> = {
  default: "border-white/10 bg-slate-900/45",
  muted: "border-white/8 bg-slate-950/35",
  danger: "border-rose-300/20 bg-rose-400/10",
  warning: "border-amber-300/20 bg-amber-400/10",
};

export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  { as, className, tone = "default", ...props },
  ref,
) {
  const Component = as ?? "div";
  return (
    <Component
      ref={ref}
      className={cn(
        "rounded-2xl border shadow-[0_24px_80px_-30px_rgba(0,0,0,0.75)] backdrop-blur-md",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
});
