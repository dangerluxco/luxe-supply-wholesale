"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { clsx } from "@/lib/clsx";

const AVAILABILITY = [
  { value: "all", label: "All items" },
  { value: "available", label: "Available" },
  { value: "held", label: "On hold" },
  { value: "sold", label: "Sold out" },
] as const;

const SORT_BASE = [
  { value: "newest", label: "Newest" },
  { value: "brand", label: "Brand A–Z" },
  { value: "title", label: "Title A–Z" },
] as const;

const SORT_PRICE = [
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
] as const;

type FilterOption = { name: string; count: number };

export function CatalogFilters({
  brands,
  categories = [],
  resultCount,
  totalCount,
  pricesVisible = true,
  hasMore = false,
}: {
  brands: FilterOption[];
  categories?: FilterOption[];
  resultCount: number;
  totalCount: number;
  pricesVisible?: boolean;
  hasMore?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();

  const qParam = params.get("q") ?? "";
  const brand = params.get("brand") ?? "";
  const category = params.get("category") ?? "";
  const availability = params.get("availability") || "available";
  const sort = params.get("sort") || "newest";

  const [q, setQ] = useState(qParam);

  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  function replace(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    // Changing any filter re-slices the result set — always restart at page 1.
    sp.delete("page");
    // Drop legacy chip-filter params if present
    sp.delete("material");
    sp.delete("era");
    sp.delete("min");
    sp.delete("max");
    sp.delete("available");
    start(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  }

  function clearAll() {
    setQ("");
    start(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  // Debounce search like legacy (~140ms feel; use 200ms)
  useEffect(() => {
    const t = setTimeout(() => {
      if (q === qParam) return;
      replace({ q: q.trim() || null });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasActiveFilters = !!(qParam || brand || category || availability !== "available");

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (qParam) chips.push({ key: "q", label: `“${qParam}”`, onRemove: () => replace({ q: null }) });
  if (brand) chips.push({ key: "brand", label: brand, onRemove: () => replace({ brand: null }) });
  if (category) chips.push({ key: "category", label: category, onRemove: () => replace({ category: null }) });
  if (availability !== "available") {
    const label = AVAILABILITY.find((a) => a.value === availability)?.label || availability;
    chips.push({ key: "availability", label, onRemove: () => replace({ availability: "available" }) });
  }

  const metaParts = [`Found ${resultCount} item${resultCount === 1 ? "" : "s"}`];
  if (totalCount !== resultCount) metaParts.push(`of ${totalCount} loaded`);
  if (hasMore) metaParts.push("load more for additional items");

  const sortOptions = pricesVisible ? [...SORT_BASE, ...SORT_PRICE] : [...SORT_BASE];

  const field =
    "flex min-w-0 flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted";
  const control =
    "h-10 w-full rounded-chip border border-border bg-surface px-3 text-[12.5px] font-medium normal-case tracking-normal text-ink outline-none focus:border-accent";

  return (
    <div className="sticky top-[60px] z-30 border-b border-border bg-surface/95 px-8 py-4 backdrop-blur-sm">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(160px,1.3fr)_repeat(4,minmax(110px,0.7fr))]">
        <label className={field}>
          <span className="sr-only">Search catalog</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, description, SKU, brand, category…"
            className={clsx(control, "font-normal")}
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>

        <label className={field}>
          <span>Brand</span>
          <select
            value={brand}
            onChange={(e) => replace({ brand: e.target.value || null })}
            className={control}
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name} ({b.count})
              </option>
            ))}
          </select>
        </label>

        <label className={field}>
          <span>Category</span>
          <select
            value={category}
            onChange={(e) => replace({ category: e.target.value || null })}
            className={control}
            disabled={categories.length === 0}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </label>

        <label className={field}>
          <span>Availability</span>
          <select
            value={availability}
            onChange={(e) => replace({ availability: e.target.value || "available" })}
            className={control}
          >
            {AVAILABILITY.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className={field}>
          <span>Sort</span>
          <select
            value={sortOptions.some((o) => o.value === sort) ? sort : "newest"}
            onChange={(e) => replace({ sort: e.target.value || "newest" })}
            className={control}
          >
            {sortOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="text-[12px] font-medium text-muted">{metaParts.join(" · ")}</p>
        {chips.length > 0 ? (
          <>
            <span className="text-[12px] text-muted">·</span>
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.onRemove}
                className="flex items-center gap-1 rounded-chip border border-border bg-ground px-2 py-0.5 text-[11px] text-secondary transition hover:border-accent hover:text-ink"
              >
                {c.label}
                <span aria-hidden className="text-muted">
                  ×
                </span>
              </button>
            ))}
          </>
        ) : null}
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent hover:underline"
          >
            Clear all filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
