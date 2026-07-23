"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QUOTE_STATUSES } from "@/lib/constants";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  contacted: "Contacted",
  quoted: "Invoiced",
  closed: "Closed",
  declined: "Declined",
  timed_out: "Timed out",
};

/**
 * Status updates via API — no `"use server"` imports (soft-nav safe).
 *
 * "Invoiced" (`quoted`) is display-only here: reaching it marks every SKU sold,
 * so the only path is the Generate-invoice button, which also creates the
 * invoice document. Picking it from this dropdown used to sell out the items
 * with no invoice behind them.
 */
export function QuoteStatusSelect({
  quoteId,
  status,
}: {
  quoteId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <select
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setError(null);
          start(async () => {
            const res = await fetch(`/api/staff/quotes/${quoteId}/status`, {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: next }),
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              setError(body.error || "Could not update status.");
              return;
            }
            router.refresh();
          });
        }}
        className="h-8 w-full rounded-chip border border-border bg-ground px-2 text-[11px] disabled:opacity-60"
      >
        {QUOTE_STATUSES.filter((s) => s !== "quoted" || s === status).map((s) => (
          <option key={s} value={s} disabled={s === "quoted"}>
            {STATUS_LABEL[s] || s}
          </option>
        ))}
      </select>
      {error ? (
        <p className="mt-1 text-[10px] leading-snug text-danger">{error}</p>
      ) : null}
    </div>
  );
}
