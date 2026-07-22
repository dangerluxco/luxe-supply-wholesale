"use client";

import { useRouter } from "next/navigation";

/**
 * History-aware back control. Uses router.back() so the previous page's state
 * (catalog filters, search, scroll) is restored; falls back to `fallbackHref`
 * when the page was opened directly (deep link, new tab).
 */
export function BackButton({
  fallbackHref,
  label = "Back",
  className,
}: {
  fallbackHref: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={
        className ||
        "pressable inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted transition hover:text-ink"
      }
    >
      ‹ {label}
    </button>
  );
}
