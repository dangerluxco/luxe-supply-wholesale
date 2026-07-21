"use client";

import { useTransition } from "react";
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

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          await fetch(`/api/staff/quotes/${quoteId}/status`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          });
          router.refresh();
        });
      }}
      className="h-8 w-full rounded-chip border border-border bg-ground px-2 text-[11px] disabled:opacity-60"
    >
      {QUOTE_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s] || s}
        </option>
      ))}
    </select>
  );
}
