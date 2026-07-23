"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { useCartBadge } from "@/components/CartBadgeProvider";
import { PressableButton } from "@/components/PressableButton";

export function AddToOrderButton({
  sku,
  price,
  disabled,
  inCart,
  pendingRequest,
}: {
  sku: string;
  price: number;
  disabled?: boolean;
  /** Piece is already in the buyer's cart — link to it instead of re-adding. */
  inCart?: boolean;
  /** Piece is held for the buyer's submitted invoice request — can't be re-added. */
  pendingRequest?: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const { setCartBadge } = useCartBadge();

  if (inCart) {
    return (
      <Link
        href="/wholesale/cart"
        className="flex h-[50px] items-center justify-center rounded-chip border border-ink bg-surface text-[12.5px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:bg-ground"
      >
        In your order — view cart →
      </Link>
    );
  }

  if (pendingRequest) {
    return (
      <div className="flex h-[50px] cursor-not-allowed items-center justify-center rounded-chip border border-border bg-ground text-[12.5px] uppercase tracking-[0.14em] text-muted">
        On your pending invoice request
      </div>
    );
  }

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
