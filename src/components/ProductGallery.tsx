"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export type GalleryItem = {
  title: string;
  sku: string;
  imageUrls: string[];
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.5;

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

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    dragRef.current = null;
    dragging.current = false;
  }, []);

  useEffect(() => {
    resetZoom();
  }, [safeIndex, resetZoom]);

  const clampScale = useCallback((value: number) => {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 100) / 100));
  }, []);

  const zoomBy = useCallback(
    (delta: number, origin?: { x: number; y: number }) => {
      setScale((prev) => {
        const next = clampScale(prev + delta);
        if (next === MIN_SCALE) {
          setOffset({ x: 0, y: 0 });
          return next;
        }
        if (origin && stageRef.current && prev > 0) {
          const rect = stageRef.current.getBoundingClientRect();
          const cx = origin.x - rect.left - rect.width / 2;
          const cy = origin.y - rect.top - rect.height / 2;
          const ratio = next / prev;
          setOffset((o) => ({
            x: cx - (cx - o.x) * ratio,
            y: cy - (cy - o.y) * ratio,
          }));
        }
        return next;
      });
    },
    [clampScale],
  );

  const toggleZoom = useCallback((clientX?: number, clientY?: number) => {
    setScale((prev) => {
      if (prev > MIN_SCALE) {
        setOffset({ x: 0, y: 0 });
        return MIN_SCALE;
      }
      const next = 2;
      if (clientX != null && clientY != null && stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        setOffset({
          x: (rect.width / 2 - (clientX - rect.left)) * (next - 1),
          y: (rect.height / 2 - (clientY - rect.top)) * (next - 1),
        });
      }
      return next;
    });
  }, []);

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
      if (e.key === "Escape") {
        if (scale > MIN_SCALE) {
          e.preventDefault();
          resetZoom();
          return;
        }
        onClose();
      }
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
      if (e.key === "-" || e.key === "_") zoomBy(-ZOOM_STEP);
      if (e.key === "0") resetZoom();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, resetZoom, scale, step, zoomBy]);

  // Native wheel listener so we can preventDefault (React passive listeners can't).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!url) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP / 2 : -ZOOM_STEP / 2;
      zoomBy(delta, { x: e.clientX, y: e.clientY });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [url, zoomBy]);

  function onPointerDown(e: React.PointerEvent<HTMLImageElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = false;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLImageElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragging.current = true;
    if (scale <= MIN_SCALE) return;
    setOffset({
      x: drag.originX + dx,
      y: drag.originY + dy,
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLImageElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    const wasDragging = dragging.current;
    dragRef.current = null;
    dragging.current = false;
    if (!wasDragging) {
      toggleZoom(e.clientX, e.clientY);
    }
  }

  const zoomed = scale > MIN_SCALE;
  const zoomPct = Math.round(scale * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} photos`}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-card border border-white/10 bg-[#1a1a1c] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[16px] font-semibold text-ground">{item.title}</div>
            <div className="mt-0.5 font-mono text-[11px] text-[#8B897F]">SKU {item.sku}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={() => zoomBy(-ZOOM_STEP)}
                disabled={scale <= MIN_SCALE}
                className="flex h-8 w-8 items-center justify-center rounded-chip border border-white/15 font-mono text-[16px] text-[#C9C7BE] hover:border-white/30 hover:text-ground disabled:opacity-30"
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="min-w-[3.25rem] rounded-chip border border-white/15 px-2 py-1.5 font-mono text-[11px] text-[#C9C7BE] hover:border-white/30 hover:text-ground"
                aria-label="Reset zoom"
              >
                {zoomPct}%
              </button>
              <button
                type="button"
                onClick={() => zoomBy(ZOOM_STEP)}
                disabled={scale >= MAX_SCALE}
                className="flex h-8 w-8 items-center justify-center rounded-chip border border-white/15 font-mono text-[16px] text-[#C9C7BE] hover:border-white/30 hover:text-ground disabled:opacity-30"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-chip border border-white/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#C9C7BE] hover:border-white/30 hover:text-ground"
            >
              Close
            </button>
          </div>
        </div>

        <div
          ref={stageRef}
          className="relative flex min-h-[280px] items-center justify-center overflow-hidden bg-black/40 px-4 py-6 sm:min-h-[480px] sm:px-12 sm:py-8"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={item.title}
              draggable={false}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                dragRef.current = null;
                dragging.current = false;
              }}
              style={{
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
                transformOrigin: "center center",
              }}
              className={`max-h-[70vh] w-auto max-w-full select-none object-contain touch-none ${
                zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
              }`}
            />
          ) : (
            <div className="font-mono text-[12px] text-white/40">No photos for this piece</div>
          )}

          {urls.length > 1 && !zoomed ? (
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

          {url ? (
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-chip bg-ink/70 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-[#C9C7BE]">
              {zoomed ? "Drag to pan · click or Esc to reset" : "Click or scroll to zoom"}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
          <span className="font-mono text-[11px] text-[#8B897F]">
            {urls.length ? `${safeIndex + 1} / ${urls.length}` : "0 / 0"}
          </span>
          <div className="flex items-center gap-1 sm:hidden">
            <button
              type="button"
              onClick={() => zoomBy(-ZOOM_STEP)}
              disabled={scale <= MIN_SCALE}
              className="flex h-8 w-8 items-center justify-center rounded-chip border border-white/15 font-mono text-[16px] text-[#C9C7BE] disabled:opacity-30"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="min-w-[3rem] rounded-chip border border-white/15 px-2 py-1.5 font-mono text-[11px] text-[#C9C7BE]"
            >
              {zoomPct}%
            </button>
            <button
              type="button"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={scale >= MAX_SCALE}
              className="flex h-8 w-8 items-center justify-center rounded-chip border border-white/15 font-mono text-[16px] text-[#C9C7BE] disabled:opacity-30"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
          {urls.length > 1 ? (
            <div className="flex max-w-[55%] gap-1.5 overflow-x-auto sm:max-w-[70%]">
              {urls.map((thumb, i) => (
                <button
                  key={`${thumb}-${i}`}
                  type="button"
                  onClick={() => onIndexChange(i)}
                  className={`relative h-10 w-10 shrink-0 overflow-hidden rounded border ${
                    i === safeIndex ? "border-accent" : "border-white/15 opacity-70 hover:opacity-100"
                  }`}
                >
                  <Image src={thumb} alt="" fill sizes="40px" className="object-cover" />
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
