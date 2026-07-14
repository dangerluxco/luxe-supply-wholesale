"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateInvoiceFromQuote } from "@/lib/actions/invoices";

export function GenerateInvoiceButton({
  quoteId,
  disabled,
}: {
  quoteId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
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
            const res = await generateInvoiceFromQuote(quoteId);
            if (res?.error) {
              setError(res.error);
              return;
            }
            if (res?.invoiceId) router.push(`/wholesaleportal/rep/invoices/${res.invoiceId}`);
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
