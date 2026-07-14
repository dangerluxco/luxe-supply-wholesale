"use client";

import { useActionState } from "react";
import { markInvoiceShippedAction } from "@/lib/actions/invoices";
import { CARRIERS } from "@/lib/constants";

const fieldClass =
  "h-9 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

export function InvoiceFulfillmentForm({ invoiceId }: { invoiceId: string }) {
  const [state, action, pending] = useActionState(markInvoiceShippedAction, {} as {
    error?: string;
    message?: string;
  });

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>CARRIER</span>
        <select name="carrier" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            Select carrier…
          </option>
          {CARRIERS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>TRACKING NUMBER (OPTIONAL)</span>
        <input name="trackingNumber" className={`${fieldClass} font-mono`} />
      </label>

      {state?.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
      {state?.message ? <p className="text-[12px] text-[#4E9A6A]">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Mark shipped"}
      </button>
    </form>
  );
}
