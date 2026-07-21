"use client";

import { useEffect, useState } from "react";
import { ProductCard, type CatalogProduct } from "@/components/ProductCard";
import { CatalogLoadMore } from "@/components/CatalogLoadMore";
import { PaginationControls } from "@/components/PaginationControls";
import { InfoTip } from "@/components/InfoTip";

const STORAGE_KEY = "luxe-staff-catalog-show-cost";

export type StaffCatalogCard = CatalogProduct & { sku: string; cost: number | null };

/**
 * Staff catalog browsing grid — reuses the exact same ProductCard the buyer
 * storefront renders (FR-018: "staff catalog should match the client-facing
 * view"), plus a staff-only cost/margin toggle and a link to preview the
 * actual buyer view.
 */
export function StaffCatalogGrid({
  products,
  currentLimit,
  hasMore,
  page = 1,
  totalPages = 1,
  totalItems,
  perPage,
}: {
  products: StaffCatalogCard[];
  currentLimit: number;
  hasMore: boolean;
  page?: number;
  totalPages?: number;
  totalItems?: number;
  perPage?: number;
}) {
  const [showCost, setShowCost] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved != null) setShowCost(saved === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggleShowCost(next: boolean) {
    setShowCost(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-secondary">
          <input
            type="checkbox"
            checked={showCost}
            onChange={(e) => toggleShowCost(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent,#B08D3E)]"
          />
          Show cost &amp; margin
          <InfoTip label="Staff-only fields">
            Cost and profit margin are never shown to buyers — this toggle just controls whether
            you see them here. Turn it off to preview cards exactly as buyers see them.
          </InfoTip>
        </label>
        <div className="flex-1" />
        <a
          href="/wholesale"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-chip border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary transition hover:border-accent hover:text-ink"
        >
          View as buyer ↗
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((p, i) => (
          <ProductCard
            key={`${p.sku}-${i}`}
            p={p}
            layout="grid"
            pricesVisible
            selectable={false}
            linkHref={`/wholesaleportal/rep/catalog/${encodeURIComponent(p.sku)}/edit`}
            staffCost={showCost ? p.cost : undefined}
          />
        ))}
      </div>

      {totalItems != null && perPage != null ? (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          perPage={perPage}
        />
      ) : null}
      {page >= totalPages ? <CatalogLoadMore currentLimit={currentLimit} hasMore={hasMore} /> : null}
    </div>
  );
}
