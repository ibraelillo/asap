import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./lib/cn.js";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:bg-slate-950/80",
        className,
      )}
      {...props}
    />
  );
});
