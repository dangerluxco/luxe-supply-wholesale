"use client";

import { useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";

const STORAGE_KEY = "luxe-wholesale-bundles-expanded";
const PAGE_SIZE = 20;

/**
 * Collapsible "Bundles" tab that sits above the catalog grid — collapsed by
 * default so the individual-items catalog is the buyer's default view, per
 * FR-008. Bundle cards themselves (BundleStrip) are untouched; this only
 * controls whether/how many of them are shown at once.
 */
export function BundlesSection({ count, children }: { count: number; children: React.ReactNode[] }) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    try {
      setExpanded(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (count === 0) return null;

  const remaining = children.length - visibleCount;

  return (
    <div className="mb-6 overflow-hidden rounded-card border border-border bg-surface">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-ground/60"
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[15px] font-semibold text-ink">Bundles</span>
          <span className="text-[12px] text-muted">
            {count} curated {count === 1 ? "bundle" : "bundles"} available
          </span>
        </div>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold uppercase tracking-[0.1em] text-accent">
          {expanded ? "Hide bundles" : "View bundles"}
          <span className={clsx("inline-block transition-transform", expanded && "rotate-180")}>⌄</span>
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-border px-5 py-5">
          {/* Each BundleStrip already carries its own bottom margin. */}
          {children.slice(0, visibleCount)}
          {remaining > 0 ? (
            <button
              type="button"
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="mt-4 w-full rounded-chip border border-border py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-secondary transition hover:border-accent hover:text-ink"
            >
              Show more bundles ({remaining} more)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
