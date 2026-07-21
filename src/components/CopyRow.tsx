"use client";

import { useState } from "react";

/** Inline label + value + "Copy" button — for pasting a value (email, link) into
 * somewhere else (e.g. a Calendar "Guests" field) when auto-fill doesn't stick. */
export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted">
      <span>{label}</span>
      <span className="truncate font-mono text-ink">{value}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(value).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded-chip border border-border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-secondary transition hover:border-accent hover:text-ink"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
