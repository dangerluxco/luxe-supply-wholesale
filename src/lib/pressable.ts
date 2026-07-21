import { clsx } from "@/lib/clsx";

/**
 * Pressed / busy visual classes — same language as CheckoutNavButton.
 * Prefer setting `aria-busy` on the control; global CSS also reacts to that.
 */
export function pressableClass(
  busy?: boolean,
  ...extra: Array<string | false | null | undefined>
): string {
  return clsx(
    "transition",
    busy ? "scale-[0.98] opacity-70" : "hover:opacity-90 active:scale-[0.98] active:opacity-80",
    ...extra,
  );
}
