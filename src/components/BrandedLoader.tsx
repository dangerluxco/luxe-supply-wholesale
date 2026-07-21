/**
 * Branded loading state — the LUXE SUPPLY* wordmark pulsing while a route's
 * server components fetch. Used by route-level loading.tsx files (App Router
 * streams this instantly, before Firestore data resolves) and client-side
 * Suspense fallbacks. Server-component safe: markup + Tailwind only.
 */
export function BrandedLoader({
  label = "Loading",
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
        "flex flex-col items-center justify-center gap-3 " +
        (fullScreen ? "min-h-screen" : "min-h-[55vh]")
      }
    >
      <span
        className={
          "animate-pulse font-sans text-[20px] font-semibold tracking-[0.08em] " +
          (tone === "light" ? "text-ground" : "text-ink")
        }
      >
        LUXE SUPPLY<span className="text-accent">*</span>
      </span>
      <span className="micro-badge text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
    </div>
  );
}
