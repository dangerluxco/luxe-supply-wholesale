"use client";

import { useEffect, useCallback } from "react";

export type GalleryItem = {
  title: string;
  sku: string;
  imageUrls: string[];
};

export function ProductGallery({
  item,
  index,
  onIndexChange,
  onClose,
}: {
  item: GalleryItem;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const urls = item.imageUrls.filter(Boolean);
  const safeIndex = urls.length ? Math.min(Math.max(index, 0), urls.length - 1) : 0;
  const url = urls[safeIndex] || "";

  const step = useCallback(
    (delta: number) => {
      if (!urls.length) return;
      const next = safeIndex + delta;
      if (next < 0 || next >= urls.length) return;
      onIndexChange(next);
    },
    [onIndexChange, safeIndex, urls.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, step]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} photos`}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-card border border-white/10 bg-[#1a1a1c] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[16px] font-semibold text-ground">{item.title}</div>
            <div className="mt-0.5 font-mono text-[11px] text-[#8B897F]">SKU {item.sku}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-chip border border-white/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#C9C7BE] hover:border-white/30 hover:text-ground"
          >
            Close
          </button>
        </div>

        <div className="relative flex min-h-[280px] items-center justify-center bg-black/40 px-12 py-8 sm:min-h-[420px]">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={item.title}
              className="max-h-[70vh] w-auto max-w-full object-contain"
            />
          ) : (
            <div className="font-mono text-[12px] text-white/40">No photos for this piece</div>
          )}

          {urls.length > 1 ? (
            <>
              <button
                type="button"
                disabled={safeIndex <= 0}
                onClick={() => step(-1)}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-ink/70 text-ground disabled:opacity-30"
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={safeIndex >= urls.length - 1}
                onClick={() => step(1)}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-ink/70 text-ground disabled:opacity-30"
                aria-label="Next photo"
              >
                ›
              </button>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
          <span className="font-mono text-[11px] text-[#8B897F]">
            {urls.length ? `${safeIndex + 1} / ${urls.length}` : "0 / 0"}
          </span>
          {urls.length > 1 ? (
            <div className="flex max-w-[70%] gap-1.5 overflow-x-auto">
              {urls.map((thumb, i) => (
                <button
                  key={`${thumb}-${i}`}
                  type="button"
                  onClick={() => onIndexChange(i)}
                  className={`h-10 w-10 shrink-0 overflow-hidden rounded border ${
                    i === safeIndex ? "border-accent" : "border-white/15 opacity-70 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  );
}
