"use client";

import { useTransition } from "react";
import { removeSkuFromCart } from "@/lib/actions/buyer-firestore";

export function RemoveCartItemButton({ sku }: { sku: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => removeSkuFromCart(sku))}
      className="text-[11px] text-muted hover:text-danger disabled:opacity-50"
    >
      Remove
    </button>
  );
}
