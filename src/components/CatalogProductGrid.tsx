"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductCard, type CatalogProduct } from "./ProductCard";
import { addSkusToCart } from "@/lib/actions/buyer-firestore";
import { PRODUCT_STATUS } from "@/lib/constants";
import { clsx } from "@/lib/clsx";
import { money } from "@/lib/format";
import { useStorefrontAvailability } from "@/components/StorefrontAvailability";

const STORAGE_KEY = "luxe-wholesale-catalog-view";

export function CatalogProductGrid({
  products,
  pricesVisible = true,
  cartSkus = [],
}: {
  products: CatalogProduct[];
  pricesVisible?: boolean;
  /** SKUs already in the buyer's cart (including pieces inside suggested lots). */
  cartSkus?: string[];
}) {
  const router = useRouter();
  const { isBundled } = useStorefrontAvailability();
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const inCart = useMemo(() => {
    const set = new Set(cartSkus.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean));
    return (sku: string) => set.has(String(sku || "").trim().toUpperCase());
  }, [cartSkus]);

  // Drop pieces the moment they enter an active bundle (live poll), before RSC refresh.
  const visibleProducts = useMemo(
    () => products.filter((p) => !isBundled(p.sku)),
    [products, isBundled],
  );

  const selectableSkus = useMemo(
    () =>
      visibleProducts
        .filter(
          (p) =>
            p.status !== PRODUCT_STATUS.ON_HOLD &&
            p.status !== PRODUCT_STATUS.SOLD &&
            !inCart(p.sku),
        )
        .map((p) => p.sku),
    [visibleProducts, inCart],
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "list" || saved === "grid") setLayout(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Drop selection for products no longer selectable (filtered out, sold, or already in cart)
  useEffect(() => {
    const allowed = new Set(selectableSkus);
    setSelected((prev) => {
      const next = new Set([...prev].filter((sku) => allowed.has(sku)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableSkus]);

  function setView(next: "grid" | "list") {
    setLayout(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function toggle(sku: string) {
    if (inCart(sku)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(selectableSkus));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const selectedList = [...selected];
  const selectedTotal = visibleProducts
    .filter((p) => selected.has(p.sku))
    .reduce((s, p) => s + (p.wholesalePrice || 0), 0);
  const allSelected =
    selectableSkus.length > 0 && selectableSkus.every((sku) => selected.has(sku));

  function addSelected() {
    if (!selectedList.length) return;
    if (!pricesVisible) {
      router.push("/wholesale/sign-in?next=/wholesale");
      return;
    }
    start(async () => {
      const res = await addSkusToCart(selectedList);
      if (res?.error) {
        setMessage(res.error);
        return;
      }
      setMessage(
        res.skipped
          ? `Added ${res.added} · ${res.skipped} skipped`
          : `Added ${res.added} to your order`,
      );
      clearSelection();
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-chip border border-border bg-surface px-3 py-1.5 text-[12px] text-secondary">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = selectedList.length > 0 && !allSelected;
            }}
            onChange={() => (allSelected ? clearSelection() : selectAllVisible())}
            className="h-3.5 w-3.5 accent-[var(--accent,#B08D3E)]"
          />
          Select all
        </label>
        <div className="flex-1" />
        <span className="mr-2 font-mono text-[10px] tracking-[0.12em] text-muted">VIEW</span>
        <button
          type="button"
          onClick={() => setView("grid")}
          aria-pressed={layout === "grid"}
          className={clsx(
            "rounded-chip border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition",
            layout === "grid"
              ? "border-ink bg-ink text-ground"
              : "border-border bg-surface text-secondary hover:border-accent",
          )}
        >
          Grid
        </button>
        <button
          type="button"
          onClick={() => setView("list")}
          aria-pressed={layout === "list"}
          className={clsx(
            "rounded-chip border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition",
            layout === "list"
              ? "border-ink bg-ink text-ground"
              : "border-border bg-surface text-secondary hover:border-accent",
          )}
        >
          List
        </button>
      </div>

      <div
        className={clsx(
          layout === "grid"
            ? "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "flex flex-col gap-3",
        )}
      >
        {visibleProducts.map((p, i) => (
          <ProductCard
            key={`${p.sku}-${i}`}
            p={p}
            layout={layout}
            pricesVisible={pricesVisible}
            selected={selected.has(p.sku)}
            inCart={inCart(p.sku)}
            selectable={
              p.status !== PRODUCT_STATUS.ON_HOLD &&
              p.status !== PRODUCT_STATUS.SOLD &&
              !inCart(p.sku)
            }
            onToggleSelect={toggle}
          />
        ))}
      </div>

      {selectedList.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-6 py-3 shadow-[0_-12px_40px_-20px_rgba(22,22,26,0.35)] backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] text-ink">
              {selectedList.length} selected
              {pricesVisible ? (
                <span className="text-muted"> · {money(selectedTotal)}</span>
              ) : null}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-chip border border-border px-3 py-2 text-[11.5px] uppercase tracking-[0.1em] text-secondary hover:border-accent"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={addSelected}
              className="rounded-chip bg-ink px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ground disabled:opacity-60"
            >
              {pending
                ? "Adding…"
                : pricesVisible
                  ? `Add selected to order (${selectedList.length})`
                  : "Sign in to add selected"}
            </button>
          </div>
          {message ? (
            <div className="mx-auto mt-2 max-w-6xl text-[12px] text-secondary">{message}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
