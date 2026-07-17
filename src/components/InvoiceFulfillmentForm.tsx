"use client";

import { useState, useTransition } from "react";
import { CARRIERS } from "@/lib/constants";

const fieldClass =
  "h-9 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

/** Mark shipped via fetch API — no `"use server"` (soft-nav safe). */
export function InvoiceFulfillmentForm({ invoiceId }: { invoiceId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setMessage(null);
        start(async () => {
          const res = await fetch(
            `/api/staff/invoices/${encodeURIComponent(invoiceId)}/shipped`,
            {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                carrier: String(fd.get("carrier") || ""),
                trackingNumber: String(fd.get("trackingNumber") || ""),
              }),
            },
          );
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          if (!res.ok || data.error) {
            setError(data.error || "Could not mark shipped.");
            return;
          }
          setMessage(data.message || "Marked shipped.");
          window.location.reload();
        });
      }}
    >
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

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}

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
