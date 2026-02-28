import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Description,
} from "@headlessui/react";
import type { ReactNode } from "react";
import { cn } from "./lib/cn.js";

export interface DrawerProps {
  open: boolean;
  onClose(open: boolean): void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClassName = "max-w-2xl",
  className,
}: DrawerProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-200" />

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-4 sm:pl-8">
            <DialogPanel
              className={cn(
                "pointer-events-auto flex h-full w-screen flex-col border-l border-white/10 bg-slate-950/96 shadow-[0_28px_120px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl",
                widthClassName,
                className,
              )}
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                <div className="min-w-0">
                  {title ? (
                    <DialogTitle className="text-lg font-semibold text-slate-100">
                      {title}
                    </DialogTitle>
                  ) : null}
                  {description ? (
                    <Description className="mt-2 text-sm text-slate-300/90">
                      {description}
                    </Description>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => onClose(false)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

              {footer ? (
                <div className="border-t border-white/10 px-6 py-4">{footer}</div>
              ) : null}
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
