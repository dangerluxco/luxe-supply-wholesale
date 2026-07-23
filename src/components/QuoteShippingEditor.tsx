"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";

export type ShippingMethodOption = {
  id: string;
  label: string;
  price: number;
  compEligible: boolean;
  enabled: boolean;
};

/**
 * Shipping row of the TOTALS card, with staff editing via API — no `"use
 * server"` imports (soft-nav safe). Locked once an invoice exists (the agreed
 * fee is on the invoice); until then any configured method can be applied,
 * including ones hidden from buyer checkout.
 */
export function QuoteShippingEditor({
  quoteId,
  shippingLabel,
  shipping,
  comped,
  cartTotal,
  methods,
  freeShippingThreshold,
  locked,
}: {
  quoteId: string;
  shippingLabel: string;
  shipping: number;
  comped: boolean;
  cartTotal: number;
  methods: ShippingMethodOption[];
  freeShippingThreshold: number;
  locked: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function chargeFor(m: ShippingMethodOption): { price: number; comped: boolean } {
    const isComped =
      freeShippingThreshold > 0 && m.compEligible && cartTotal >= freeShippingThreshold;
    return { price: isComped ? 0 : m.price, comped: isComped };
  }

  function apply(methodId: string) {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/quotes/${quoteId}/shipping`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ methodId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || "Could not update shipping.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">
          {shippingLabel ? `Shipping · ${shippingLabel}` : "Shipping"}
        </span>
        <span className="flex items-center gap-2 text-right text-ink">
          {comped ? "Free · comped" : money(Math.round(shipping))}
          {!locked ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setEditing((v) => !v);
              }}
              className="text-[11px] text-muted transition hover:text-ink disabled:opacity-50"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          ) : null}
        </span>
      </div>
      {editing ? (
        <select
          value=""
          disabled={pending}
          onChange={(e) => e.target.value && apply(e.target.value)}
          className="mt-2 h-8 w-full rounded-chip border border-border bg-ground px-2 text-[11px] disabled:opacity-60"
        >
          <option value="" disabled>
            {pending ? "Updating…" : "Choose a shipping method…"}
          </option>
          {methods.map((m) => {
            const charge = chargeFor(m);
            return (
              <option key={m.id} value={m.id}>
                {m.label} — {charge.comped ? "free (comped)" : money(m.price)}
                {m.enabled ? "" : " · hidden from buyers"}
              </option>
            );
          })}
        </select>
      ) : null}
      {error ? <p className="mt-1 text-[10px] leading-snug text-danger">{error}</p> : null}
    </div>
  );
}
