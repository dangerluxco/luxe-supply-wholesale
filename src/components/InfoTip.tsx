"use client";

import { useId, useState } from "react";
import { clsx } from "@/lib/clsx";

/** Inline (i) control with a hover/focus popover for short process notes. */
export function InfoTip({
  label,
  children,
  className,
}: {
  /** Accessible name for the icon button */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={clsx("relative inline-flex align-middle", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent/10 text-[10px] font-semibold leading-none text-accent outline-none hover:bg-accent/20 focus-visible:ring-1 focus-visible:ring-accent"
      >
        i
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+6px)] z-40 w-[min(280px,70vw)] -translate-x-1/2 rounded-card border border-border bg-surface px-3 py-2 text-left text-[11px] leading-relaxed text-secondary shadow-[0_12px_30px_-18px_rgba(22,22,26,0.55)]"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
