"use client";

import { useState } from "react";
import Image from "next/image";
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
    <div className={clsx("w-full", className)}>
      <button
        type="button"
        onClick={() => urls.length && setOpen(true)}
        disabled={!urls.length}
        aria-label={urls.length ? `View photos of ${title}` : undefined}
        className={clsx(
          // Cap by width + viewport height so the hero stays square but never
          // dominates a tall desktop column or short mobile viewport.
          "relative mx-auto block aspect-square w-full max-w-[min(100%,440px,48vh)] overflow-hidden rounded-card border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
          urls.length ? "cursor-zoom-in" : "cursor-default",
        )}
      >
        {/* All photos render stacked; inactive ones sit invisible underneath and
            stream in right after first paint, so switching photos is instant
            instead of fetching each one on demand. */}
        {urls.length ? (
          <div className="relative h-full w-full">
            {urls.map((u, i) => (
              <div
                key={`${u}-${i}`}
                aria-hidden={i !== safeActive}
                className={clsx(
                  "absolute inset-0",
                  i === safeActive ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <Placeholder
                  label={title}
                  imageSrc={u}
                  priority={i === 0}
                  sizes="(max-width: 640px) 100vw, 440px"
                  className="h-full w-full"
                />
              </div>
            ))}
            <OneOfOneBadge />
          </div>
        ) : (
          <Placeholder label={title} imageSrc={null} className="h-full w-full">
            <OneOfOneBadge />
          </Placeholder>
        )}
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
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-chip border transition sm:h-16 sm:w-16",
                i === safeActive ? "border-accent" : "border-border opacity-70 hover:opacity-100",
              )}
            >
              <Image src={u} alt="" fill loading="lazy" sizes="64px" className="object-cover" />
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
