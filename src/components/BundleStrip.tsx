"use client";

import { useState, useTransition } from "react";
import { Placeholder } from "./Placeholder";
import { MicroBadge } from "./badges";
import { money } from "@/lib/format";
import { addSuggestedLotToCart } from "@/lib/actions/bundles-firestore";
import { ProductGallery } from "./ProductGallery";

type LotItem = {
  sku: string;
  title: string;
  imageUrl: string | null;
  imageUrls: string[];
};

type LotForStrip = {
  id: string;
  title: string;
  lotPrice: number;
  items: LotItem[];
  individualSum: number;
};

export function BundleStrip({ lot }: { lot: LotForStrip }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [gallerySku, setGallerySku] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const saveAmt = Math.max(0, lot.individualSum - lot.lotPrice);
  const savePct = lot.individualSum > 0 ? Math.round((saveAmt / lot.individualSum) * 100) : 0;
  const galleryItem = gallerySku
    ? lot.items.find((it) => it.sku === gallerySku) || null
    : null;

  return (
    <>
      <div className="mb-7 grid grid-cols-1 overflow-hidden rounded-card bg-ink md:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-3.5 p-7">
          <div className="flex items-center gap-2.5">
            <MicroBadge tone="solid-gold" className="tracking-[0.12em]">
              CURATED BUNDLE
            </MicroBadge>
            <span className="font-mono text-[11px] text-[#8B897F]">from your rep</span>
          </div>
          <div className="text-[24px] font-semibold tracking-tight text-ground">
            {lot.title}{" "}
            <span className="text-[16px] font-normal text-[#8B897F]">
              / {lot.items.length} pieces, one provenance story
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lot.items.map((p) => {
              const urls = p.imageUrls?.length
                ? p.imageUrls
                : p.imageUrl
                  ? [p.imageUrl]
                  : [];
              return (
                <button
                  key={p.sku}
                  type="button"
                  onClick={() => {
                    setGallerySku(p.sku);
                    setGalleryIndex(0);
                  }}
                  title={`View photos · ${p.title || p.sku}`}
                  className="group relative overflow-hidden rounded-[6px] border border-white/10 transition hover:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <Placeholder
                    variant="dark"
                    imageSrc={urls[0] || null}
                    label={p.sku}
                    className="h-[84px] w-[84px] items-end pb-1 text-[8.5px]"
                  />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center font-mono text-[8px] tracking-[0.08em] text-[#C9C7BE] opacity-0 transition group-hover:opacity-100">
                    {urls.length > 1 ? `${urls.length} PHOTOS` : "VIEW"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col justify-center gap-[7px] border-t border-white/10 p-7 md:border-l md:border-t-0">
          <div className="flex justify-between text-[12px] text-[#8B897F]">
            Individually
            <span className="font-mono line-through">{money(lot.individualSum)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-[#C9C7BE]">Bundle</span>
            <span className="text-[26px] font-semibold text-ground">{money(lot.lotPrice)}</span>
          </div>
          {saveAmt > 0 ? (
            <div className="self-end font-mono text-[10px] font-semibold tracking-[0.08em] text-accent">
              SAVE {savePct}% · {money(saveAmt)}
            </div>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await addSuggestedLotToCart(lot.id);
                if (res?.error) setError(res.error);
                else setError("");
              })
            }
            className="mt-2.5 h-10 w-full rounded-[7px] bg-accent text-[12.5px] font-semibold text-ink transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Adding…" : `Add all ${lot.items.length} to order`}
          </button>
          {error ? <div className="text-[11px] text-[#E8A090]">{error}</div> : null}
        </div>
      </div>

      {galleryItem ? (
        <ProductGallery
          item={{
            title: galleryItem.title || galleryItem.sku,
            sku: galleryItem.sku,
            imageUrls: galleryItem.imageUrls?.length
              ? galleryItem.imageUrls
              : galleryItem.imageUrl
                ? [galleryItem.imageUrl]
                : [],
          }}
          index={galleryIndex}
          onIndexChange={setGalleryIndex}
          onClose={() => setGallerySku(null)}
        />
      ) : null}
    </>
  );
}
