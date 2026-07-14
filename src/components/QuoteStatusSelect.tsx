"use client";

import { useTransition } from "react";
import { QUOTE_STATUSES } from "@/lib/constants";
import { setQuoteStatus } from "@/lib/actions/quote-status";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  contacted: "Contacted",
  quoted: "Invoiced",
  closed: "Closed",
  declined: "Declined",
  timed_out: "Timed out",
};

export function QuoteStatusSelect({
  quoteId,
  status,
}: {
  quoteId: string;
  status: string;
}) {
  const [pending, start] = useTransition();

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          await setQuoteStatus(quoteId, next);
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
