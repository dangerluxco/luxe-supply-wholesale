"use client";

import Link from "next/link";
import { useState } from "react";
import { Placeholder, OneOfOneBadge } from "./Placeholder";
import { MicroBadge } from "./badges";
import { money } from "@/lib/format";
import { formatMargin, marginFor, marginTone, marginToneClass } from "@/lib/pricing";
import { PRODUCT_STATUS } from "@/lib/constants";
import { ProductGallery } from "./ProductGallery";
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
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const onHold = p.status === PRODUCT_STATUS.ON_HOLD;
  const soldOut = p.status === PRODUCT_STATUS.SOLD;
  const heldByYou = !!p.heldByYou;
  const canSelect = selectable && !onHold && !soldOut && !inCart;
  const metaBits = [p.brand || p.origin, p.era.split(" · ")[1] ?? p.era, p.material].filter(
    Boolean,
  );
  const urls =
    p.imageUrls?.length
      ? p.imageUrls
      : p.primaryImageUrl
        ? [p.primaryImageUrl]
        : [];
  const margin = staffCost !== undefined ? marginFor(staffCost, p.wholesalePrice) : null;

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
      <div className="mt-1 font-mono text-[11px] uppercase text-muted">
        {metaBits.join(" · ")}
      </div>
      {margin ? (
        <div className={"mt-1 font-mono text-[10.5px] " + marginToneClass(marginTone(margin.percent))}>
          cost {staffCost != null ? money(Math.round(staffCost)) : "—"} · margin {formatMargin(margin)}
        </div>
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#3A3934]">
        {inCart ? (
          <MicroBadge tone="outline-gold">In cart</MicroBadge>
        ) : heldByYou ? (
          <MicroBadge tone="outline-gold">Held for you</MicroBadge>
        ) : (
          <>
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{
                background: soldOut ? "#8B897F" : onHold ? "#B08D3E" : "#4E9A6A",
              }}
            />
            {soldOut
              ? "Sold out"
              : onHold
                ? "On hold for another buyer"
                : `Available · ${p.location.split(" · ")[0]}`}
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      <div
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
        )}
      >
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
            className={clsx(
              "w-full",
              layout === "grid" ? "aspect-square" : "h-full min-h-[140px] aspect-square",
            )}
          >
            <OneOfOneBadge className={canSelect || inCart ? "left-11" : undefined} />
            {soldOut ? (
              <MicroBadge tone="outline-gray" className="absolute bottom-2.5 left-2.5">
                SOLD
              </MicroBadge>
            ) : onHold && !inCart ? (
              <MicroBadge tone="solid-gold" className="absolute bottom-2.5 left-2.5">
                HOLD · 24H
              </MicroBadge>
            ) : inCart ? (
              <MicroBadge tone="solid-dark" className="absolute bottom-2.5 left-2.5">
                IN CART
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
            href={linkHref || `/wholesale/product/${encodeURIComponent(p.sku)}`}
            className="flex flex-1 flex-col"
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
    </>
  );
}
