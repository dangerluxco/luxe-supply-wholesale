"use client";

import { useState, useTransition } from "react";
import { PressableButton } from "@/components/PressableButton";

/** Mark paid via fetch API — no `"use server"` (soft-nav safe). */
export function InvoiceMarkPaidButton({ invoiceId }: { invoiceId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <PressableButton
        pending={pending}
        pendingLabel="Saving…"
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await fetch(
              `/api/staff/invoices/${encodeURIComponent(invoiceId)}/paid`,
              { method: "POST", credentials: "same-origin" },
            );
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok || data.error) {
              setError(data.error || "Could not update invoice.");
              return;
            }
            window.location.reload();
          });
        }}
        className="h-9 rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary hover:border-accent hover:text-ink disabled:opacity-60"
      >
        Mark paid
      </PressableButton>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
