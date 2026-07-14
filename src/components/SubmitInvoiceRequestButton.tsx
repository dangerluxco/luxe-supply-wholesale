"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitInvoiceRequest } from "@/lib/actions/buyer-firestore";

export function SubmitInvoiceRequestButton({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      <button
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const res = await submitInvoiceRequest();
            if (res?.ok) {
              setError(null);
              router.push("/wholesale/orders");
            } else if (res?.error) {
              setError(res.error);
            }
          })
        }
        className="flex h-11 w-full items-center justify-center rounded-chip bg-ink text-[12px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit for review"}
      </button>
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
    </div>
  );
}
