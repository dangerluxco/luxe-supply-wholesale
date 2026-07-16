"use client";

import { useState, useTransition } from "react";

/**
 * Generate invoice via API — no `"use server"` imports (soft-nav safe).
 */
export function GenerateInvoiceButton({
  quoteId,
  disabled,
}: {
  quoteId: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await fetch(`/api/staff/quotes/${quoteId}/generate-invoice`, {
              method: "POST",
              credentials: "same-origin",
            });
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
              invoiceId?: string;
            };
            if (!res.ok || data.error) {
              setError(data.error || "Could not generate invoice.");
              return;
            }
            if (data.invoiceId) {
              window.location.assign(`/wholesaleportal/rep/invoices/${data.invoiceId}`);
            }
          });
        }}
        className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground transition disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate invoice"}
      </button>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
