import { Logo } from "@/components/Logo";

/**
 * Instant PDP chrome while Firestore product lookup resolves.
 * Note: soft nav often keeps the previous route painted until the RSC stream
 * starts — ProductCard / BuyerTopbar show a client BrandedLoader for that gap.
 */
export default function ProductLoading() {
  return (
    <div className="px-8 pb-16 pt-6" aria-busy="true" aria-label="Loading product">
      <div className="mb-8 flex flex-col items-center justify-center py-6">
        <Logo height={32} className="animate-pulse" priority />
        <span className="micro-badge mt-2 text-[10px] uppercase tracking-[0.18em] text-muted">
          Loading piece
        </span>
      </div>
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-12">
        <div className="w-full">
          <div className="mx-auto aspect-square w-full max-w-[min(100%,440px,48vh)] animate-pulse rounded-card border border-border bg-border/40" />
          <div className="mt-3 flex gap-2">
            <div className="h-16 w-16 animate-pulse rounded-chip bg-border/40" />
            <div className="h-16 w-16 animate-pulse rounded-chip bg-border/40" />
            <div className="h-16 w-16 animate-pulse rounded-chip bg-border/40" />
          </div>
        </div>
        <div className="space-y-3 pt-1">
          <div className="h-3 w-24 animate-pulse rounded bg-border/70" />
          <div className="h-8 w-3/4 max-w-md animate-pulse rounded bg-border/60" />
          <div className="h-4 w-48 animate-pulse rounded bg-border/50" />
          <div className="mt-5 h-7 w-28 animate-pulse rounded bg-border/60" />
          <div className="mt-8 h-[50px] w-full max-w-sm animate-pulse rounded-chip bg-border/50" />
        </div>
      </div>
    </div>
  );
}
