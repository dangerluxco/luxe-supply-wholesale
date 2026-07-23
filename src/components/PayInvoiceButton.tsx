"use client";

import { useState, useTransition } from "react";
import { money } from "@/lib/format";

/**
 * Buyer "Pay online": asks the server for a Stripe-hosted Checkout URL and
 * redirects. No Stripe.js loads on our pages — payment details are entered on
 * Stripe's domain. Rendered only when the deployment has Stripe configured.
 */
export function PayInvoiceButton({
  invoiceNumber,
  balance,
}: {
  invoiceNumber: string;
  balance: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await fetch(
              `/api/buyer/invoices/${encodeURIComponent(invoiceNumber)}/pay`,
              { method: "POST", credentials: "same-origin" },
            );
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
              url?: string;
            };
            if (!res.ok || data.error || !data.url) {
              setError(data.error || "Could not start the payment — try again.");
              return;
            }
            window.location.href = data.url;
          });
        }}
        className="pressable flex h-11 w-full items-center justify-center rounded-chip bg-ink text-[12px] font-semibold uppercase tracking-[0.14em] text-ground transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Opening secure checkout…" : `Pay ${money(Math.round(balance))} online`}
      </button>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
