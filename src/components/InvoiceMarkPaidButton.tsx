"use client";

import { useState, useTransition } from "react";
import { markInvoicePaid } from "@/lib/actions/invoices";

export function InvoiceMarkPaidButton({ invoiceId }: { invoiceId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await markInvoicePaid(invoiceId);
            if (res?.error) setError(res.error);
          });
        }}
        className="h-9 rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary transition hover:border-accent hover:text-ink disabled:opacity-60"
      >
        {pending ? "Saving…" : "Mark paid"}
      </button>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
