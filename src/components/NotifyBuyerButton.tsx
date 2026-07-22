"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Wishlist row action: email the buyer that a piece is available again. */
export function NotifyBuyerButton({
  alertId,
  disabled,
  disabledReason,
}: {
  alertId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={disabled || pending}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await fetch(`/api/staff/hold-alerts/${alertId}/notify`, {
              method: "POST",
              credentials: "same-origin",
            });
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok || data.error) {
              setError(data.error || "Could not notify.");
              return;
            }
            router.refresh();
          });
        }}
        className="h-7 rounded-chip bg-ink px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90 disabled:opacity-40"
      >
        {pending ? "Sending…" : "Notify buyer"}
      </button>
      {error ? <div className="mt-1 text-[10.5px] text-danger">{error}</div> : null}
    </div>
  );
}
