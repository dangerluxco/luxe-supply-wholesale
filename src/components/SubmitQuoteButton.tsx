"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitQuoteRequest } from "@/lib/actions/buyer-firestore";

export function SubmitQuoteButton() {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await submitQuoteRequest();
          if (res?.ok) router.push("/wholesale/orders");
          else if (res?.error) alert(res.error);
        })
      }
      className="flex h-11 w-full items-center justify-center rounded-chip bg-ink text-[12px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
    >
      {pending ? "Submitting…" : "Request quote"}
    </button>
  );
}
