"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";
import { Placeholder } from "@/components/Placeholder";
import { portalDisplayTitle } from "@/components/PortalItemLine";

export type SimilarItem = {
  sku: string;
  title: string;
  brand: string;
  price: number | null;
  imageUrl: string | null;
  era: string;
  material: string;
  condition: string;
  match: number;
};

const THUMB_SIZE = "h-9 w-9";
const PREVIEW_SIZE = 170;
const PREVIEW_GAP = 10;

/** Floating, viewport-fixed image preview — escapes the row/scroll-container entirely, so it overlays whatever is below rather than needing the row to reserve space for it. */
function HoverPreview({ item, anchor }: { item: SimilarItem; anchor: DOMRect }) {
  const showBelow = anchor.top < PREVIEW_SIZE + PREVIEW_GAP + 16;
  const top = showBelow ? anchor.bottom + PREVIEW_GAP : anchor.top - PREVIEW_SIZE - PREVIEW_GAP;
  const left = Math.min(
    Math.max(anchor.left + anchor.width / 2 - PREVIEW_SIZE / 2, 8),
    window.innerWidth - PREVIEW_SIZE - 8,
  );

  return (
    <div
      className="pointer-events-none fixed z-40 overflow-hidden rounded-chip border border-accent/50 shadow-[0_20px_48px_-12px_rgba(22,22,26,0.5)]"
      style={{ top, left, width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
    >
      <Placeholder
        imageSrc={item.imageUrl}
        alt={portalDisplayTitle(item.title, item.sku)}
        className="h-full w-full"
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="text-[12.5px] text-ink">{value}</div>
    </div>
  );
}

/** Centered modal with full details on one similar item — opened by clicking its thumbnail. */
function SimilarItemModal({
  item,
  added,
  adding,
  onClose,
  onAdd,
}: {
  item: SimilarItem;
  added: boolean;
  adding: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-card border border-border bg-surface p-5 shadow-[0_24px_64px_-16px_rgba(22,22,26,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">SIMILAR ITEM</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[13px] text-muted transition hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 h-56 w-full overflow-hidden rounded-chip">
          <Placeholder
            imageSrc={item.imageUrl}
            alt={portalDisplayTitle(item.title, item.sku)}
            className="h-full w-full"
          />
        </div>

        <div className="mt-3">
          <div className="text-[14px] text-ink">{portalDisplayTitle(item.title, item.sku)}</div>
          <div className="font-mono text-[11px] text-muted">{item.sku}</div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <DetailRow label="Brand" value={item.brand || "—"} />
          <DetailRow
            label="Price"
            value={item.price != null ? money(Math.round(item.price)) : "—"}
          />
          <DetailRow label="Era" value={item.era || "—"} />
          <DetailRow label="Material" value={item.material || "—"} />
          <DetailRow label="Condition" value={item.condition || "—"} />
        </div>

        <button
          type="button"
          disabled={added || adding}
          onClick={onAdd}
          className="mt-4 h-10 w-full rounded-chip bg-ink text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ground transition disabled:opacity-60"
        >
          {added ? "Added" : adding ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

/**
 * Full-width, image-only carousel of similar pieces — auto-loads under every
 * item (no click needed to reveal it). Clicking a thumbnail opens a centered
 * modal with that piece's full details and an Add action.
 */
export function SimilarItemsCarousel({
  sku,
  excludeSkus,
  onAdd,
}: {
  sku: string;
  excludeSkus: string[];
  onAdd: (item: SimilarItem) => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SimilarItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalSku, setModalSku] = useState<string | null>(null);
  const [addedSkus, setAddedSkus] = useState<Set<string>>(new Set());
  const [addingSku, setAddingSku] = useState<string | null>(null);
  const [hover, setHover] = useState<{ item: SimilarItem; rect: DOMRect } | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startScroll: number; moved: boolean; pointerId: number } | null>(
    null,
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ sku, exclude: excludeSkus.join(",") });
    fetch(`/api/staff/catalog/similar?${params.toString()}`, { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { items?: SimilarItem[]; error?: string }) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setItems(data.items || []);
      })
      .catch(() => setError("Could not load suggestions."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku]);

  // Pointer capture is only grabbed once real dragging is detected (past the
  // movement threshold) — capturing it immediately on every mousedown, even a
  // plain click, silently swallows the click event a child button would
  // otherwise receive, which is why the thumbnails stopped responding to clicks.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const el = scrollerRef.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startScroll: el.scrollLeft, moved: false, pointerId: e.pointerId };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollerRef.current;
    if (!el || !drag.current) return;
    const dx = e.clientX - drag.current.startX;
    if (!drag.current.moved && Math.abs(dx) > 4) {
      drag.current.moved = true;
      el.setPointerCapture(drag.current.pointerId);
      setHover(null);
    }
    if (drag.current.moved) {
      el.scrollLeft = drag.current.startScroll - dx;
    }
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.moved) {
      scrollerRef.current?.releasePointerCapture(e.pointerId);
    }
    // Always fully reset once the gesture ends — otherwise a stale `moved: true`
    // from a past click (even from a tiny few-pixel jitter during the click)
    // lingers forever, since it only ever refreshes on the *next* pointerdown.
    // Hovering alone never triggers one, so every hover after that one jittery
    // click would silently get blocked by the `drag.current?.moved` guard.
    drag.current = null;
  }
  function onPointerLeave() {
    // A genuine active drag keeps receiving events via pointer capture
    // regardless of the cursor's visual position — don't reset mid-drag, let
    // the eventual pointerup do the full reset. Only safe to clear here when
    // nothing was actually being dragged.
    if (!drag.current?.moved) {
      drag.current = null;
    }
  }

  function openModal(it: SimilarItem) {
    if (drag.current?.moved) {
      drag.current.moved = false;
      return;
    }
    setHover(null);
    setModalSku(it.sku);
  }

  function onHover(it: SimilarItem, e: React.MouseEvent<HTMLButtonElement>) {
    if (drag.current?.moved) return;
    setHover({ item: it, rect: e.currentTarget.getBoundingClientRect() });
  }

  async function handleAdd(it: SimilarItem) {
    setAddingSku(it.sku);
    try {
      await onAdd(it);
      setAddedSkus((prev) => new Set(prev).add(it.sku));
    } catch {
      /* parent surfaces its own error state */
    } finally {
      setAddingSku(null);
    }
  }

  if (loading) {
    return <div className="py-2 text-[11px] text-muted">Looking for similar items…</div>;
  }
  if (error) {
    return <div className="py-2 text-[11px] text-danger">{error}</div>;
  }
  if (!items.length) {
    return null;
  }

  const modalItem = items.find((it) => it.sku === modalSku) || null;

  return (
    <div className="py-2">
      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        className="flex w-full snap-x cursor-grab gap-1.5 overflow-x-auto scroll-smooth px-1 py-1 active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map((it) => (
          <button
            key={it.sku}
            type="button"
            onClick={() => openModal(it)}
            onMouseEnter={(e) => onHover(it, e)}
            onMouseLeave={() => setHover(null)}
            title={portalDisplayTitle(it.title, it.sku)}
            className={`${THUMB_SIZE} shrink-0 snap-start overflow-hidden rounded-chip border transition-colors ${
              hover?.item.sku === it.sku ? "border-accent" : "border-border hover:border-accent/60"
            }`}
          >
            <Placeholder
              imageSrc={it.imageUrl}
              alt={portalDisplayTitle(it.title, it.sku)}
              className="h-full w-full"
            />
          </button>
        ))}
      </div>

      {hover && !modalItem ? <HoverPreview item={hover.item} anchor={hover.rect} /> : null}

      {modalItem ? (
        <SimilarItemModal
          item={modalItem}
          added={addedSkus.has(modalItem.sku)}
          adding={addingSku === modalItem.sku}
          onClose={() => setModalSku(null)}
          onAdd={() => handleAdd(modalItem)}
        />
      ) : null}
    </div>
  );
}
