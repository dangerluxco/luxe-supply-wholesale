"use client";

import { useState } from "react";
import { Placeholder, OneOfOneBadge } from "./Placeholder";
import { ProductGallery } from "./ProductGallery";
import { clsx } from "@/lib/clsx";

export function ProductPdpGallery({
  title,
  sku,
  imageUrls,
  className,
}: {
  title: string;
  sku: string;
  imageUrls: (string | null | undefined)[];
  className?: string;
}) {
  const urls = imageUrls.filter((u): u is string => !!u);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const safeActive = urls.length ? Math.min(active, urls.length - 1) : 0;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => urls.length && setOpen(true)}
        disabled={!urls.length}
        aria-label={urls.length ? `View photos of ${title}` : undefined}
        className={clsx(
          "relative block aspect-square w-full overflow-hidden rounded-card border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
          urls.length ? "cursor-zoom-in" : "cursor-default",
        )}
      >
        <Placeholder label={title} imageSrc={urls[safeActive] || null} className="h-full w-full">
          <OneOfOneBadge />
        </Placeholder>
        {urls.length > 1 ? (
          <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-chip bg-ink/70 px-2 py-1 font-mono text-[10px] text-ground">
            {safeActive + 1} / {urls.length}
          </span>
        ) : null}
      </button>

      {urls.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {urls.map((u, i) => (
            <button
              key={`${u}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Photo ${i + 1}`}
              className={clsx(
                "h-16 w-16 shrink-0 overflow-hidden rounded-chip border transition",
                i === safeActive ? "border-accent" : "border-border opacity-70 hover:opacity-100",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <ProductGallery
          item={{ title, sku, imageUrls: urls }}
          index={safeActive}
          onIndexChange={setActive}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
