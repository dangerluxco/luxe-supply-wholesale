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

export function CatalogFilters({
  brands,
  resultCount,
  totalCount,
  pricesVisible = true,
  hasMore = false,
}: {
  brands: string[];
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
    // Drop legacy chip-filter params if present
    sp.delete("material");
    sp.delete("era");
    sp.delete("min");
    sp.delete("max");
    sp.delete("category");
    sp.delete("available");
    start(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
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

  const metaParts = [`Showing ${resultCount} of ${totalCount} loaded`];
  if (qParam) metaParts.push(`search "${qParam}"`);
  if (brand) metaParts.push(brand);
  if (availability === "available") metaParts.push("available only");
  if (availability === "sold") metaParts.push("sold out only");
  if (availability === "held") metaParts.push("on hold only");
  if (hasMore) metaParts.push("load more for additional items");

  const sortOptions = pricesVisible ? [...SORT_BASE, ...SORT_PRICE] : [...SORT_BASE];

  const field =
    "flex min-w-0 flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted";
  const control =
    "h-10 w-full rounded-chip border border-border bg-surface px-3 text-[12.5px] font-medium normal-case tracking-normal text-ink outline-none focus:border-accent";

  return (
    <div className="border-b border-border bg-surface px-8 py-4">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(160px,1.4fr)_repeat(3,minmax(120px,0.7fr))]">
        <label className={field}>
          <span className="sr-only">Search catalog</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, SKU, or brand…"
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
              <option key={b} value={b}>
                {b}
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

      <p className="mt-3 text-[12px] font-medium text-muted">{metaParts.join(" · ")}</p>
    </div>
  );
}
