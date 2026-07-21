"use client";

import { useTransition } from "react";
import { removeSkuFromCart } from "@/lib/actions/buyer-firestore";
import { PressableButton } from "@/components/PressableButton";

export function RemoveCartItemButton({ sku }: { sku: string }) {
  const [pending, start] = useTransition();
  return (
    <PressableButton
      pending={pending}
      pendingLabel="Removing…"
      onClick={() => start(async () => removeSkuFromCart(sku))}
      className="text-[11px] text-muted hover:text-danger disabled:opacity-50"
    >
      Remove
    </PressableButton>
  );
}
