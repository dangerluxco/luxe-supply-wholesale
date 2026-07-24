"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ProductCard, type CatalogProduct } from "./ProductCard";
import { addHoldAlertAction, removeHoldAlertAction } from "@/lib/actions/wishlist";
import { PRODUCT_STATUS } from "@/lib/constants";
import { clsx } from "@/lib/clsx";
import { money } from "@/lib/format";
import { useCartBadge } from "@/components/CartBadgeProvider";
import { CheckoutNavButton } from "@/components/CheckoutNavButton";
import { useStorefrontAvailability } from "@/components/StorefrontAvailability";

const STORAGE_KEY = "luxe-wholesale-catalog-view";
// Selection survives pagination / PDP round-trips within the tab. Stored as
// [sku, price] pairs — off-page selections still need a price for the bar total.
const SELECTED_KEY = "luxe-wholesale-catalog-selected";

type AddCartResult = {
  error?: string;
  added?: number;
  skipped?: number;
  ok?: boolean;
  cartCount?: number;
  cartTotal?: number;
  limitNote?: string;
};

async function postAddToCart(skus: string[]): Promise<AddCartResult> {
  const res = await fetch("/api/buyer/cart/add", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skus }),
  });
  const data = (await res.json().catch(() => ({}))) as AddCartResult;
  if (!res.ok && !data.error) {
    return { error: "Could not add to cart." };
  }
  return data;
}

export function CatalogProductGrid({
  products,
  pricesVisible = true,
  cartSkus = [],
  wishlistSkus = [],
}: {
  products: CatalogProduct[];
  pricesVisible?: boolean;
  /** SKUs already in the buyer's cart (including pieces inside suggested lots). */
  cartSkus?: string[];
  /** SKUs the buyer already has a "notify me" wishlist entry for. */
  wishlistSkus?: string[];
}) {
  const router = useRouter();
  const { isBundled } = useStorefrontAvailability();
  const { cartCount: badgeCount, cartTotal: badgeTotal, setCartBadge } = useCartBadge();
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const selectionHydrated = useRef(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<
    { text: string; kind: "success" | "error"; showCheckout?: boolean } | null
  >(null);
  const [quickAddingSku, setQuickAddingSku] = useState<string | null>(null);
  const [wishlisted, setWishlisted] = useState<Set<string>>(
    () => new Set(wishlistSkus.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)),
  );
  const [wishlistPendingSku, setWishlistPendingSku] = useState<string | null>(null);

  const isWishlisted = (sku: string) => wishlisted.has(String(sku || "").trim().toUpperCase());

  function toggleWishlist(sku: string) {
    if (!pricesVisible) {
      router.push("/wholesale/sign-in?next=/wholesale");
      return;
    }
    const key = String(sku || "").trim().toUpperCase();
    const currentlyWishlisted = isWishlisted(sku);
    setWishlistPendingSku(sku);
    start(async () => {
      const res = currentlyWishlisted
        ? await removeHoldAlertAction(sku)
        : await addHoldAlertAction(sku);
      setWishlistPendingSku(null);
      if (res?.error) {
        setMessage({ text: res.error, kind: "error" });
        return;
      }
      setWishlisted((prev) => {
        const next = new Set(prev);
        if (currentlyWishlisted) next.delete(key);
        else next.add(key);
        return next;
      });
      setMessage({
        text: currentlyWishlisted ? "Removed from wishlist." : "Added to wishlist.",
        kind: "success",
      });
    });
  }

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
            !p.pendingRequest &&
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

  // Restore any in-flight selection (this runs before the save effect below,
  // so the initial empty state never clobbers what's stored).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SELECTED_KEY);
      if (raw) {
        const entries = (JSON.parse(raw) as Array<[string, number]>).filter(
          (e): e is [string, number] =>
            Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "number",
        );
        if (entries.length) setSelected(new Map(entries));
      }
    } catch {
      /* ignore */
    }
    selectionHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!selectionHydrated.current) return;
    try {
      if (selected.size) sessionStorage.setItem(SELECTED_KEY, JSON.stringify([...selected]));
      else sessionStorage.removeItem(SELECTED_KEY);
    } catch {
      /* ignore */
    }
  }, [selected]);

  // Auto-dismiss the quick-add toast (only relevant when nothing is selected —
  // otherwise the message lives inside the persistent selection bar).
  useEffect(() => {
    if (!message || selectedList.length > 0) return;
    // Give the success toast's "Checkout" CTA a little longer to be noticed/clicked.
    const id = setTimeout(() => setMessage(null), message.showCheckout ? 6000 : 3000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  // Drop selections that became unselectable (sold, held, or already in cart).
  // Only prune SKUs visible on THIS page — pruning by "not in the current page"
  // was the bug that wiped the selection on every pagination.
  useEffect(() => {
    const visible = new Set(visibleProducts.map((p) => p.sku));
    const allowed = new Set(selectableSkus);
    setSelected((prev) => {
      const next = new Map(prev);
      for (const sku of prev.keys()) {
        if (visible.has(sku) && !allowed.has(sku)) next.delete(sku);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [selectableSkus, visibleProducts]);

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
      const next = new Map(prev);
      if (next.has(sku)) next.delete(sku);
      else {
        const p = visibleProducts.find((x) => x.sku === sku);
        next.set(sku, p?.wholesalePrice || 0);
      }
      return next;
    });
  }

  // Adds this page's selectable pieces on top of what's already selected on
  // other pages; unchecking removes only this page's (see the header checkbox).
  function selectAllVisible() {
    const allowed = new Set(selectableSkus);
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of visibleProducts) {
        if (allowed.has(p.sku)) next.set(p.sku, p.wholesalePrice || 0);
      }
      return next;
    });
  }

  function deselectAllVisible() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of visibleProducts) next.delete(p.sku);
      return next.size === prev.size ? prev : next;
    });
  }

  function clearSelection() {
    setSelected(new Map());
  }

  const selectedList = [...selected.keys()];
  const selectedTotal = [...selected.values()].reduce((s, v) => s + v, 0);
  const allSelected =
    selectableSkus.length > 0 && selectableSkus.every((sku) => selected.has(sku));

  function quickAdd(sku: string) {
    if (!pricesVisible) {
      router.push("/wholesale/sign-in?next=/wholesale");
      return;
    }
    setMessage(null);
    setQuickAddingSku(sku);
    start(async () => {
      const res = await postAddToCart([sku]);
      setQuickAddingSku(null);
      if (res.error) {
        setMessage({ text: res.error, kind: "error" });
        return;
      }
      if (typeof res.cartCount === "number") {
        setCartBadge({ cartCount: res.cartCount, cartTotal: res.cartTotal ?? 0 });
      }
      setMessage(
        res.skipped
          ? { text: "Already held — could not add.", kind: "error" }
          : { text: "Added to your order.", kind: "success", showCheckout: true },
      );
      // Soft refresh in background so product "in cart" state catches up — don't block UI.
      void router.refresh();
    });
  }

  function addSelected() {
    if (!selectedList.length) return;
    if (!pricesVisible) {
      router.push("/wholesale/sign-in?next=/wholesale");
      return;
    }
    start(async () => {
      const res = await postAddToCart(selectedList);
      if (res.error) {
        setMessage({ text: res.error, kind: "error" });
        return;
      }
      if (typeof res.cartCount === "number") {
        setCartBadge({ cartCount: res.cartCount, cartTotal: res.cartTotal ?? 0 });
      }
      setMessage({
        text: res.skipped
          ? `Added ${res.added ?? 0} · ${res.skipped} skipped${
              res.limitNote ? ` — ${res.limitNote}` : ""
            }`
          : `Added ${res.added ?? selectedList.length} to your order`,
        kind: "success",
        showCheckout: true,
      });
      clearSelection();
      void router.refresh();
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
            onChange={() => (allSelected ? deselectAllVisible() : selectAllVisible())}
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
              !p.pendingRequest &&
              !inCart(p.sku)
            }
            onToggleSelect={toggle}
            onQuickAdd={quickAdd}
            quickAddPending={quickAddingSku === p.sku}
            onWishlist={toggleWishlist}
            wishlistPending={wishlistPendingSku === p.sku}
            wishlisted={isWishlisted(p.sku)}
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
              aria-busy={pending || undefined}
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
            <div className="mx-auto mt-2 flex max-w-6xl items-center gap-3 text-[12px] text-secondary">
              <span>{message.text}</span>
              {message.showCheckout ? (
                <CheckoutNavButton
                  cartCount={badgeCount}
                  cartTotal={badgeTotal}
                  compact
                  label="Checkout →"
                  className="h-8 px-3 text-[11px]"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : message ? (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-chip border border-border bg-surface px-4 py-2.5 text-[12px] text-secondary shadow-[0_12px_32px_-16px_rgba(22,22,26,0.35)]">
          <span>{message.text}</span>
          {message.showCheckout ? (
            <CheckoutNavButton
              cartCount={badgeCount}
              cartTotal={badgeTotal}
              compact
              label="Checkout →"
              className="h-8 px-3 text-[11px]"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
