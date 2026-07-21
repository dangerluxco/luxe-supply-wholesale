"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { useCartBadge } from "@/components/CartBadgeProvider";
import { PressableButton } from "@/components/PressableButton";

export function AddToOrderButton({
  sku,
  price,
  disabled,
}: {
  sku: string;
  price: number;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const { setCartBadge } = useCartBadge();

  if (disabled) {
    return (
      <div className="flex h-[50px] cursor-not-allowed items-center justify-center rounded-chip border border-border bg-ground text-[12.5px] uppercase tracking-[0.14em] text-muted">
        Unavailable — one of one
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <PressableButton
        pending={pending}
        pendingLabel="Placing hold…"
        onClick={() =>
          start(async () => {
            const res = await fetch("/api/buyer/cart/add", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ skus: [sku] }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
              cartCount?: number;
              cartTotal?: number;
            };
            if (!res.ok || data.error) {
              setMsg(data.error || "Could not add to cart.");
              return;
            }
            if (typeof data.cartCount === "number") {
              setCartBadge({ cartCount: data.cartCount, cartTotal: data.cartTotal ?? 0 });
            }
            setMsg(null);
            router.push("/wholesale/cart");
          })
        }
        className="flex h-[50px] w-full items-center justify-center rounded-chip bg-ink text-[12.5px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {`Add to order — ${money(price)}`}
      </PressableButton>
      {msg ? <span className="text-[12px] text-danger">{msg}</span> : null}
    </div>
  );
}
