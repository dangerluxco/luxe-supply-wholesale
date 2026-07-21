"use client";

import { clsx } from "@/lib/clsx";
import { money } from "@/lib/format";
import { pressableClass } from "@/lib/pressable";
import { useNavPress } from "@/hooks/useNavPress";

/** Checkout control with immediate pressed/pending feedback while the cart page loads. */
export function CheckoutNavButton({
  cartCount,
  cartTotal,
  compact = false,
  className,
  label = "Checkout",
}: {
  cartCount: number;
  cartTotal: number;
  compact?: boolean;
  className?: string;
  label?: string;
}) {
  const { busy, navigate } = useNavPress("/wholesale/cart");

  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      onClick={navigate}
      className={clsx(
        pressableClass(
          busy,
          "flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-chip bg-ink px-3.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ground",
        ),
        className,
      )}
    >
      {busy ? "Opening…" : label}
      {!busy && cartCount > 0 ? (
        <span className="font-mono text-[10.5px] font-normal normal-case tracking-normal text-ground/75">
          {compact ? (
            <span>({cartCount})</span>
          ) : (
            <>
              <span className="hidden sm:inline">
                ({cartCount} item{cartCount === 1 ? "" : "s"}, {money(cartTotal)})
              </span>
              <span className="sm:hidden">({cartCount})</span>
            </>
          )}
        </span>
      ) : null}
    </button>
  );
}
