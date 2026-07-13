"use client";

import { useState, useTransition } from "react";
import { addHoldAlertAction, removeHoldAlertAction } from "@/lib/actions/wishlist";

export function HoldAlertButton({ sku, active }: { sku: string; active: boolean }) {
  const [isActive, setIsActive] = useState(active);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = isActive
              ? await removeHoldAlertAction(sku)
              : await addHoldAlertAction(sku);
            if (res?.error) {
              setMsg(res.error);
            } else {
              setMsg(null);
              setIsActive((v) => !v);
            }
          })
        }
        className="flex h-11 items-center justify-center rounded-chip border border-border bg-surface px-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:border-accent disabled:opacity-60"
      >
        {pending ? "Saving…" : isActive ? "Remove from wishlist" : "Notify me when available"}
      </button>
      {msg ? <span className="text-[11px] text-danger">{msg}</span> : null}
    </div>
  );
}
