"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { clsx } from "@/lib/clsx";

/**
 * Numbered pagination over the currently loaded (and filtered) result set —
 * `?page=N` in the URL, all other params preserved. Used by both the buyer
 * storefront catalog and the staff portal catalog. Client-side soft-nav via
 * next/link on both surfaces.
 */
export function PaginationControls({
  page,
  totalPages,
  totalItems,
  perPage,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  if (totalPages <= 1) return null;

  function hrefFor(p: number) {
    const sp = new URLSearchParams(params.toString());
    if (p <= 1) sp.delete("page");
    else sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // Windowed page list: 1 … (page-1, page, page+1) … last
  const numbers: (number | "gap")[] = [];
  const push = (n: number | "gap") => {
    if (n === "gap") {
      if (numbers[numbers.length - 1] !== "gap") numbers.push("gap");
      return;
    }
    if (!numbers.includes(n)) numbers.push(n);
  };
  push(1);
  if (page - 1 > 2) push("gap");
  for (let n = Math.max(2, page - 1); n <= Math.min(totalPages - 1, page + 1); n++) push(n);
  if (page + 1 < totalPages - 1) push("gap");
  if (totalPages > 1) push(totalPages);

  const firstShown = (page - 1) * perPage + 1;
  const lastShown = Math.min(page * perPage, totalItems);

  const linkBase =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-chip px-2.5 text-[12px] font-medium transition";

  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-col items-center gap-2 border-t border-border pt-8">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={clsx(linkBase, "border border-border text-secondary hover:border-accent hover:text-ink")}>
            ‹ Prev
          </Link>
        ) : (
          <span className={clsx(linkBase, "border border-border/50 text-muted opacity-50")}>‹ Prev</span>
        )}

        {numbers.map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-[12px] text-muted">
              …
            </span>
          ) : (
            <Link
              key={n}
              href={hrefFor(n)}
              aria-current={n === page ? "page" : undefined}
              className={clsx(
                linkBase,
                n === page
                  ? "bg-ink text-ground"
                  : "border border-border text-secondary hover:border-accent hover:text-ink",
              )}
            >
              {n}
            </Link>
          ),
        )}

        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className={clsx(linkBase, "border border-border text-secondary hover:border-accent hover:text-ink")}>
            Next ›
          </Link>
        ) : (
          <span className={clsx(linkBase, "border border-border/50 text-muted opacity-50")}>Next ›</span>
        )}
      </div>
      <p className="font-mono text-[11px] text-muted">
        Showing {firstShown}–{lastShown} of {totalItems}
      </p>
    </nav>
  );
}
