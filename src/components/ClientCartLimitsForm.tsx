"use client";

import { useState, useTransition } from "react";

const fieldClass =
  "h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

/** Cart limits via fetch API — no `"use server"` (soft-nav safe). */
export function ClientCartLimitsForm({
  buyerId,
  maxCartItems,
  maxCartValue,
}: {
  buyerId: string;
  maxCartItems: number;
  maxCartValue: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setMessage(null);
        start(async () => {
          const res = await fetch(
            `/api/staff/buyers/${encodeURIComponent(buyerId)}/cart-limits`,
            {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                maxCartItems: Number(fd.get("maxCartItems") || 0),
                maxCartValue: Number(fd.get("maxCartValue") || 0),
              }),
            },
          );
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          if (!res.ok || data.error) {
            setError(data.error || "Could not update limits.");
            return;
          }
          setMessage(data.message || "Limits updated.");
        });
      }}
    >
      <p className="text-[12.5px] text-secondary">
        Caps how many pieces and how much dollar value this buyer can hold in cart / on soft
        hold. Defaults are 5 items / $5,000.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>MAX ITEMS</span>
          <input
            name="maxCartItems"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={maxCartItems}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>MAX VALUE ($)</span>
          <input
            name="maxCartValue"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={maxCartValue}
            className={fieldClass}
          />
        </label>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save limits"}
      </button>
    </form>
  );
}
