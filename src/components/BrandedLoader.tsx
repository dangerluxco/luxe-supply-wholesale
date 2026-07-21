import { Logo } from "@/components/Logo";

/**
 * Branded loading state — logo pulsing while a route's server components fetch.
 * Used by route-level loading.tsx files (App Router streams this instantly,
 * before Firestore data resolves) and client-side Suspense fallbacks.
 * Server-component safe: markup + Tailwind only.
 */
export function BrandedLoader({
  label,
  tone = "ink",
  fullScreen = false,
}: {
  label?: string;
  tone?: "ink" | "light";
  fullScreen?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col items-center justify-center " +
        (fullScreen ? "min-h-screen" : "min-h-[55vh]")
      }
      role="status"
      aria-label={label || "Loading"}
    >
      <Logo tone={tone} height={36} className="animate-pulse" priority />
      {label ? (
        <span className="micro-badge mt-3 text-[10px] uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
      ) : null}
    </div>
  );
}
