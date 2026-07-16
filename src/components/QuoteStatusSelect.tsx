"use client";

import { useTransition } from "react";
import { QUOTE_STATUSES } from "@/lib/constants";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  contacted: "Contacted",
  quoted: "Invoiced",
  closed: "Closed",
  declined: "Declined",
  timed_out: "Timed out",
};

type SetStatusAction = (
  quoteId: string,
  status: string,
) => Promise<{ error?: string; ok?: boolean }>;

/**
 * Server action is passed from the Server Component page so this client
 * module never imports a `"use server"` file (avoids soft-nav webpack stub
 * collisions with Staff / Clients / Catalog pages).
 */
export function QuoteStatusSelect({
  quoteId,
  status,
  action: setStatusAction,
}: {
  quoteId: string;
  status: string;
  action: SetStatusAction;
}) {
  const [pending, start] = useTransition();

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          await setStatusAction(quoteId, next);
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
