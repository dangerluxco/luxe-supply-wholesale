"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Placeholder } from "./Placeholder";
import { MicroBadge } from "./badges";
import { money } from "@/lib/format";
import { addSuggestedLotToCart } from "@/lib/actions/add-lot-to-cart";
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

export function BundleStrip({ lot, inCart = false }: { lot: LotForStrip; inCart?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const showInCart = inCart || justAdded;
  const [gallerySku, setGallerySku] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Normalize once so SSR HTML and client hydration always see the same integers.
  const lotPrice = Math.round(Number(lot.lotPrice) || 0);
  const individualSum = Math.round(Number(lot.individualSum) || 0);
  const saveAmt = Math.max(0, individualSum - lotPrice);
  const savePct = individualSum > 0 ? Math.round((saveAmt / individualSum) * 100) : 0;
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
            {showInCart ? (
              <MicroBadge tone="outline-gold" className="tracking-[0.1em]">
                IN CART
              </MicroBadge>
            ) : null}
            <span className="font-mono text-[11px] text-[#8B897F]">from your rep</span>
          </div>
          <div className="text-[24px] font-semibold tracking-tight text-ground">
            {lot.title}{" "}
            <span className="text-[16px] font-normal text-[#8B897F]">
              / {lot.items.length} pieces, one provenance story
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lot.items.map((p, index) => {
              const urls = p.imageUrls?.length
                ? p.imageUrls
                : p.imageUrl
                  ? [p.imageUrl]
                  : [];
              return (
                <button
                  key={`${p.sku}-${index}`}
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
          {/*
            Keep this row always mounted when we know an individual sum.
            Conditionally omitting it (e.g. when sum === lotPrice) caused SSR/client
            hydration mismatches after deploys and soft navigations.
          */}
          {individualSum > 0 ? (
            <div className="flex justify-between text-[12px] text-[#8B897F]">
              Individually
              <span className={saveAmt > 0 ? "font-mono line-through" : "font-mono"}>
                {money(individualSum)}
              </span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-[#C9C7BE]">Bundle</span>
            <span className="text-[26px] font-semibold text-ground">{money(lotPrice)}</span>
          </div>
          {saveAmt > 0 ? (
            <div className="self-end font-mono text-[10px] font-semibold tracking-[0.08em] text-accent">
              SAVE {savePct}% · {money(saveAmt)}
            </div>
          ) : null}
          <button
            type="button"
            disabled={pending || showInCart}
            onClick={() =>
              start(async () => {
                const res = await addSuggestedLotToCart(lot.id);
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                setError("");
                setJustAdded(true);
                router.refresh();
              })
            }
            className={
              showInCart
                ? "mt-2.5 h-10 w-full rounded-[7px] border border-accent/50 bg-transparent text-[12.5px] font-semibold uppercase tracking-[0.08em] text-accent"
                : "mt-2.5 h-10 w-full rounded-[7px] bg-accent text-[12.5px] font-semibold text-ink transition hover:opacity-90 disabled:opacity-60"
            }
          >
            {showInCart ? "In cart" : pending ? "Adding…" : "Add bundle to order"}
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
