"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

export function CatalogLoadMore({
  currentLimit,
  pageStep = 200,
  hasMore,
}: {
  currentLimit: number;
  pageStep?: number;
  hasMore: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  if (!hasMore) return null;

  const nextLimit = Math.min(currentLimit + pageStep, 800);
  if (nextLimit <= currentLimit) return null;

  const sp = new URLSearchParams(params.toString());
  sp.set("limit", String(nextLimit));

  return (
    <div className="mt-10 flex flex-col items-center gap-2 border-t border-border pt-8">
      <Link
        href={`${pathname}?${sp.toString()}`}
        className="rounded-chip bg-ink px-6 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ground transition hover:opacity-90"
        scroll={false}
      >
        Load more pieces
      </Link>
      <p className="font-mono text-[11px] text-muted">
        Showing {currentLimit} loaded · next batch loads up to {nextLimit}
      </p>
    </div>
  );
}
