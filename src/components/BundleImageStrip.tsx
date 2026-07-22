"use client";

import { useRef } from "react";
import Image from "next/image";

const SIZE = {
  sm: { container: "h-16 w-[200px]", item: "h-16 w-16", gap: "gap-1" },
  md: { container: "h-24 w-[248px]", item: "h-24 w-24", gap: "gap-1.5" },
} as const;

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points={direction === "left" ? "15 6 9 12 15 18" : "9 6 15 12 9 18"} />
    </svg>
  );
}

/**
 * Horizontally scrollable strip of bundle piece thumbnails. Hiding the native
 * scrollbar (for a clean look) means mouse users otherwise have no way to move
 * it, so this adds click-to-advance arrows plus mouse-drag scrolling on top of
 * the native touch/trackpad scroll — all images stay reachable either way.
 */
export function BundleImageStrip({
  images,
  size = "md",
}: {
  images: Array<string | null | undefined>;
  size?: "sm" | "md";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startScroll: number; active: boolean } | null>(null);
  const dims = SIZE[size];

  const urls = images.filter((u): u is string => !!u);
  if (!urls.length) return null;

  function scrollByStep(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const firstItem = el.firstElementChild as HTMLElement | null;
    const step = firstItem ? firstItem.offsetWidth + 6 : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const el = scrollerRef.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startScroll: el.scrollLeft, active: true };
    el.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollerRef.current;
    if (!el || !drag.current?.active) return;
    el.scrollLeft = drag.current.startScroll - (e.clientX - drag.current.startX);
  }
  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current) drag.current.active = false;
    scrollerRef.current?.releasePointerCapture(e.pointerId);
  }

  const showArrows = urls.length > 1;

  return (
    <div className={`group relative shrink-0 ${dims.container}`}>
      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className={`flex h-full w-full snap-x snap-mandatory ${dims.gap} overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden ${showArrows ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{ scrollbarWidth: "none" }}
      >
        {urls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className={`relative shrink-0 snap-start overflow-hidden rounded-chip bg-ground ${dims.item}`}
          >
            <Image
              src={url}
              alt=""
              fill
              draggable={false}
              sizes="120px"
              className="select-none object-cover"
            />
          </div>
        ))}
      </div>
      {showArrows ? (
        <>
          <button
            type="button"
            onClick={() => scrollByStep(-1)}
            aria-label="Show previous piece"
            className="absolute left-0.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-ground opacity-70 shadow-sm transition hover:opacity-100 group-hover:opacity-100"
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            type="button"
            onClick={() => scrollByStep(1)}
            aria-label="Show next piece"
            className="absolute right-0.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-ground opacity-70 shadow-sm transition hover:opacity-100 group-hover:opacity-100"
          >
            <ChevronIcon direction="right" />
          </button>
          <div className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-ink/70 px-1.5 py-0.5 text-[9px] font-semibold text-ground opacity-80">
            {urls.length}
          </div>
        </>
      ) : null}
    </div>
  );
}
