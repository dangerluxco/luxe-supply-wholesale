"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Placeholder, OneOfOneBadge } from "./Placeholder";
import { MicroBadge } from "./badges";
import { money } from "@/lib/format";
import { formatMargin, marginFor, marginTone, marginToneClass } from "@/lib/pricing";
import { PRODUCT_STATUS } from "@/lib/constants";
import { ProductGallery } from "./ProductGallery";
import { BrandedLoader } from "./BrandedLoader";
import { Logo } from "./Logo";
import { useNavPress } from "@/hooks/useNavPress";
import { clsx } from "@/lib/clsx";

export type CatalogProduct = {
  sku: string;
  name: string;
  wholesalePrice: number;
  origin: string;
  era: string;
  material: string;
  status: string;
  location: string;
  imageLabel: string;
  primaryImageUrl?: string | null;
  imageUrls?: string[];
  brand?: string | null;
  hostCompAvgUsd?: number | null;
  heldByYou?: boolean;
  heldUntil?: string | null;
};

export function ProductCard({
  p,
  layout = "grid",
  pricesVisible = true,
  selected = false,
  selectable = true,
  inCart = false,
  onToggleSelect,
  onQuickAdd,
  quickAddPending = false,
  onWishlist,
  wishlistPending = false,
  wishlisted = false,
  linkHref,
  staffCost,
}: {
  p: CatalogProduct;
  layout?: "grid" | "list";
  pricesVisible?: boolean;
  selected?: boolean;
  selectable?: boolean;
  inCart?: boolean;
  onToggleSelect?: (sku: string) => void;
  /** Adds just this piece to the cart — no selection step required. */
  onQuickAdd?: (sku: string) => void;
  quickAddPending?: boolean;
  /** Toggles a "notify me" wishlist entry — offered for pieces on hold, which can't be quick-added. */
  onWishlist?: (sku: string) => void;
  wishlistPending?: boolean;
  wishlisted?: boolean;
  /** Overrides the default buyer PDP link — e.g. the staff catalog links to the edit page instead. */
  linkHref?: string;
  /** Staff-only: cost basis, shown with a color-coded profit margin line. Omit entirely for buyers. */
  staffCost?: number | null;
}) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const onHold = p.status === PRODUCT_STATUS.ON_HOLD;
  const soldOut = p.status === PRODUCT_STATUS.SOLD;
  const heldByYou = !!p.heldByYou;
  const canSelect = selectable && !onHold && !soldOut && !inCart;
  // Brand is already in the title — only show non-empty era/material with clean separators.
  const metaBits = [p.era, p.material]
    .map((x) => String(x || "").trim())
    .filter((x) => x && x !== "—" && x !== "/");
  const urls =
    p.imageUrls?.length
      ? p.imageUrls
      : p.primaryImageUrl
        ? [p.primaryImageUrl]
        : [];
  const margin = staffCost !== undefined ? marginFor(staffCost, p.wholesalePrice) : null;
  const href = linkHref || `/wholesale/product/${encodeURIComponent(p.sku)}`;
  // Soft nav keeps the catalog painted until the RSC stream starts — loading.tsx
  // often won't appear for ~1–2s. Client pending state gives feedback in <50ms.
  const { busy, navigate } = useNavPress(href);

  function prefetchPdp() {
    router.prefetch(href);
  }

  // Prefetch when the card nears the viewport (not only on hover).
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        router.prefetch(href);
        io.disconnect();
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [href, router]);

  function openPdp(e: React.MouseEvent) {
    // Keep modified / non-primary clicks on the real <Link> (new tab, etc.).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate();
  }

  function openGallery(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!urls.length) return;
    setGalleryIndex(0);
    setGalleryOpen(true);
  }

  const details = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14.5px] font-semibold text-ink group-hover:text-ink">{p.name}</span>
        {pricesVisible ? (
          <span className="flex-none font-mono text-[13px] font-semibold text-ink">
            {money(p.wholesalePrice)}
          </span>
        ) : (
          <span className="flex-none font-mono text-[10.5px] uppercase tracking-[0.08em] text-accent">
            Sign in for price
          </span>
        )}
      </div>
      {pricesVisible && p.hostCompAvgUsd != null && Number.isFinite(p.hostCompAvgUsd) ? (
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          Comp avg ${Math.round(p.hostCompAvgUsd)}
        </div>
      ) : null}
      {metaBits.length ? (
        <div className="mt-1 font-mono text-[11px] uppercase text-muted">
          {metaBits.join(" · ")}
        </div>
      ) : null}
      {margin ? (
        <div className={"mt-1 font-mono text-[10.5px] " + marginToneClass(marginTone(margin.percent))}>
          cost {staffCost != null ? money(Math.round(staffCost)) : "—"} · margin {formatMargin(margin)}
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <div
        ref={cardRef}
        onMouseEnter={prefetchPdp}
        onFocus={prefetchPdp}
        aria-busy={busy || undefined}
        className={clsx(
          "group relative overflow-hidden rounded-card border bg-surface transition",
          inCart
            ? "border-accent/50 ring-1 ring-accent/20"
            : selected
              ? "border-accent ring-1 ring-accent/30"
              : "border-border hover:border-accent",
          layout === "list" && "flex flex-row items-stretch",
          onHold && !inCart && "opacity-80",
          soldOut && "opacity-70",
          busy && "pointer-events-none opacity-55",
        )}
      >
        {busy ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-surface/75"
            aria-hidden
          >
            <Logo height={16} className="animate-pulse" />
          </div>
        ) : null}
        {inCart ? (
          <div
            className="absolute left-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-chip border border-accent/40 bg-surface/95 shadow-sm"
            title="Already in your cart"
          >
            <input
              type="checkbox"
              checked
              disabled
              readOnly
              className="h-3.5 w-3.5 accent-[var(--accent,#B08D3E)] opacity-90"
              aria-label={`${p.name} is already in your cart`}
            />
          </div>
        ) : canSelect && onToggleSelect ? (
          <label
            className="absolute left-2.5 top-2.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-chip border border-border bg-surface/95 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(p.sku)}
              className="h-3.5 w-3.5 accent-[var(--accent,#B08D3E)]"
              aria-label={`Select ${p.name}`}
            />
          </label>
        ) : null}

        <button
          type="button"
          onClick={openGallery}
          disabled={!urls.length}
          aria-label={`View photos of ${p.name}`}
          className={clsx(
            "relative block shrink-0 overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            layout === "grid" && "w-full",
            layout === "list" && "w-[140px] sm:w-[180px]",
            urls.length ? "cursor-zoom-in" : "cursor-default",
          )}
        >
          <Placeholder
            label={`product shot — ${p.imageLabel}`}
            imageSrc={urls[0] || null}
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className={clsx(
              "w-full",
              layout === "grid" ? "aspect-square" : "h-full min-h-[140px] aspect-square",
            )}
          >
            <OneOfOneBadge className={canSelect || inCart ? "left-11" : undefined} />
            {/* Single status badge — the button label carries the rest; no duplicate tags. */}
            {soldOut ? (
              <MicroBadge tone="outline-gray" className="absolute bottom-2.5 left-2.5">
                SOLD
              </MicroBadge>
            ) : inCart ? (
              <MicroBadge tone="solid-dark" className="absolute bottom-2.5 left-2.5">
                IN CART
              </MicroBadge>
            ) : heldByYou ? (
              <MicroBadge tone="solid-gold" className="absolute bottom-2.5 left-2.5">
                HELD FOR YOU
              </MicroBadge>
            ) : onHold ? (
              <MicroBadge tone="solid-gold" className="absolute bottom-2.5 left-2.5">
                HOLD · 24H
              </MicroBadge>
            ) : null}
            {urls.length > 0 ? (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink/65 py-1 text-center font-mono text-[9px] tracking-[0.1em] text-[#C9C7BE] opacity-0 transition group-hover:opacity-100">
                {urls.length > 1 ? `${urls.length} PHOTOS` : "VIEW"}
              </span>
            ) : null}
          </Placeholder>
        </button>

        <div
          className={clsx("flex flex-1 flex-col", layout === "grid" ? "p-4" : "justify-center p-4 sm:p-5")}
        >
          <Link
            href={href}
            prefetch
            onClick={openPdp}
            className="pressable flex flex-1 flex-col"
            aria-busy={busy || undefined}
          >
            {details}
            {layout === "list" ? (
              <div className="mt-2 font-mono text-[10.5px] text-muted">SKU {p.sku}</div>
            ) : null}
          </Link>
          {onHold && !inCart && onWishlist ? (
            <button
              type="button"
              disabled={wishlistPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onWishlist(p.sku);
              }}
              className={clsx(
                "mt-2.5 h-8 w-full shrink-0 rounded-chip border text-[11px] font-semibold uppercase tracking-[0.1em] transition disabled:cursor-default disabled:opacity-50",
                wishlisted
                  ? "border-accent/40 text-accent"
                  : "border-border text-secondary hover:border-accent hover:text-ink",
              )}
            >
              {wishlistPending
                ? "Saving…"
                : wishlisted
                  ? "In wishlist ✓"
                  : "Add to wishlist"}
            </button>
          ) : onQuickAdd ? (
            <button
              type="button"
              disabled={!canSelect || quickAddPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickAdd(p.sku);
              }}
              className={clsx(
                "mt-2.5 h-8 w-full shrink-0 rounded-chip border text-[11px] font-semibold uppercase tracking-[0.1em] transition disabled:cursor-default disabled:opacity-50",
                inCart
                  ? "border-accent/40 text-accent"
                  : "border-border text-secondary hover:border-accent hover:text-ink",
              )}
            >
              {inCart
                ? "In cart"
                : quickAddPending
                  ? "Adding…"
                  : pricesVisible
                    ? "Add to cart"
                    : "Sign in to add"}
            </button>
          ) : null}
        </div>
      </div>

      {galleryOpen ? (
        <ProductGallery
          item={{
            title: p.name,
            sku: p.sku,
            imageUrls: urls,
          }}
          index={galleryIndex}
          onIndexChange={setGalleryIndex}
          onClose={() => setGalleryOpen(false)}
        />
      ) : null}

      {/* Full-route indicator: loading.tsx only paints after the server starts
          streaming the PDP segment; this covers the click→stream gap. */}
      {busy ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ground/55 backdrop-blur-[1px]">
          <BrandedLoader label="Loading piece" />
        </div>
      ) : null}
    </>
  );
}
