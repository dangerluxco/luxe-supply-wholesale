"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitInvoiceRequest } from "@/lib/actions/buyer-firestore";

export function SubmitInvoiceRequestButton() {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await submitInvoiceRequest();
          if (res?.ok) router.push("/wholesale/orders");
          else if (res?.error) alert(res.error);
        })
      }
      className="flex h-11 w-full items-center justify-center rounded-chip bg-ink text-[12px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
    >
      {pending ? "Submitting…" : "Submit for processing to invoice"}
    </button>
  );
}
