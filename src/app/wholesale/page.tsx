import { listCatalogProducts } from "@/lib/firestore/catalog";
import { CatalogFilters } from "@/components/CatalogFilters";
import { CatalogProductGrid } from "@/components/CatalogProductGrid";
import { CatalogLoadMore } from "@/components/CatalogLoadMore";
import { EmptyState } from "@/components/EmptyState";
import { BundleStrip } from "@/components/BundleStrip";
import { PRODUCT_STATUS, ROLE } from "@/lib/constants";
import { getSession } from "@/lib/auth";
import { getActiveLotsForBuyer } from "@/lib/firestore/suggestedLots";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

type SP = { [k: string]: string | string[] | undefined };

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await getSession();
  const isBuyer = !!session && session.role === ROLE.BUYER;
  const pricesVisible = isBuyer;

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q).trim();
  const brand = one(sp.brand).trim();
  const availability = one(sp.availability) || "available";
  const sort = one(sp.sort) || "newest";
  const pageLimit = Math.min(Math.max(Number(one(sp.limit)) || 200, 24), 800);

  const [{ products: all, hasMore }, lots] = await Promise.all([
    listCatalogProducts(pageLimit, {
      buyerUsername: isBuyer ? session?.username : null,
    }),
    isBuyer && session.username
      ? getActiveLotsForBuyer(session.username)
      : Promise.resolve([]),
  ]);

  const brands = [
    ...new Set(all.map((p) => p.brand).filter((b) => b && b !== "—")),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const priceBySku = new Map(all.map((p) => [p.sku, p.price ?? 0]));
  const catalogBySku = new Map(all.map((p) => [p.sku, p]));

  let products = all.filter((p) => {
    if (availability === "available") {
      if (p.soldOut) return false;
      if (p.held) return false;
    } else if (availability === "sold") {
      if (!p.soldOut) return false;
    } else if (availability === "held") {
      if (!p.held || p.soldOut) return false;
    }

    if (brand && norm(p.brand) !== norm(brand)) return false;

    if (q) {
      const hay = norm([p.title, p.sku, p.brand].filter(Boolean).join(" "));
      if (!hay.includes(norm(q))) return false;
    }
    return true;
  });

  products = [...products].sort((a, b) => {
    if (sort === "brand") {
      return String(a.brand || "").localeCompare(String(b.brand || ""), undefined, {
        sensitivity: "base",
      });
    }
    if (sort === "title") {
      return String(a.title || "").localeCompare(String(b.title || ""), undefined, {
        sensitivity: "base",
      });
    }
    if (pricesVisible && (sort === "price_asc" || sort === "price_desc")) {
      const pa = a.price;
      const pb = b.price;
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return sort === "price_asc" ? pa - pb : pb - pa;
    }
    // newest — listCatalogProducts already roughly newest-first; keep stable sku order as fallback
    return 0;
  });

  const cards = products.map((p) => ({
    sku: p.sku,
    name: p.title,
    wholesalePrice: Math.round(p.price ?? 0),
    origin: p.brand || "—",
    era: p.era,
    material: p.material,
    status: p.soldOut
      ? PRODUCT_STATUS.SOLD
      : p.held
        ? PRODUCT_STATUS.ON_HOLD
        : PRODUCT_STATUS.AVAILABLE,
    location: p.location,
    imageLabel: p.brand || p.sku,
    primaryImageUrl: p.imageUrl,
    imageUrls: p.imageUrls?.length ? p.imageUrls : p.imageUrl ? [p.imageUrl] : [],
    brand: p.brand,
    hostCompAvgUsd: p.hostCompAvgUsd,
    heldByYou: p.heldByYou,
    heldUntil: p.heldUntil,
  }));

  return (
    <div>
      <CatalogFilters
        brands={brands}
        resultCount={products.length}
        totalCount={all.length}
        pricesVisible={pricesVisible}
        hasMore={hasMore}
      />

      <div className="px-8 pb-16 pt-7">
        <div className="mb-5 flex flex-wrap items-baseline gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">The Collection</h1>
          <span className="text-[12px] text-muted">
            {all.length} pieces loaded
            {hasMore ? " (more available)" : ""} · live from Firestore · each one of one
            {!pricesVisible ? " · prices after sign-in" : ""}
          </span>
        </div>

        {!pricesVisible ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-5 py-4">
            <p className="text-[13px] text-secondary">
              Browse the one-of-one collection. Sign in with your wholesale account to see prices and place holds.
            </p>
            <a
              href="/wholesale/sign-in"
              className="rounded-chip bg-ink px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ground"
            >
              Sign in for prices
            </a>
          </div>
        ) : null}

        {lots
          .filter((lot) => lot.lotPrice != null && lot.items.length > 0)
          .map((lot) => {
            const individualSum = lot.items.reduce(
              (s, it) => s + Math.round(priceBySku.get(it.sku) ?? 0),
              0,
            );
            return (
              <BundleStrip
                key={lot.id}
                lot={{
                  id: lot.id,
                  title: lot.title,
                  lotPrice: lot.lotPrice!,
                  individualSum: individualSum || lot.lotPrice!,
                  items: lot.items.map((it) => {
                    const cat = catalogBySku.get(it.sku);
                    const imageUrls =
                      cat?.imageUrls?.length
                        ? cat.imageUrls
                        : it.imageUrls?.length
                          ? it.imageUrls
                          : it.imageUrl
                            ? [it.imageUrl]
                            : cat?.imageUrl
                              ? [cat.imageUrl]
                              : [];
                    return {
                      sku: it.sku,
                      title: it.title || cat?.title || it.sku,
                      imageUrl: imageUrls[0] || null,
                      imageUrls,
                    };
                  }),
                }}
              />
            );
          })}

        {products.length === 0 ? (
          <EmptyState
            title="No items match your search or filters."
            hint="Try clearing filters or broadening your search — the collection turns over quickly."
            className="mt-4"
          />
        ) : (
          <>
            <CatalogProductGrid products={cards} pricesVisible={pricesVisible} />
            <Suspense fallback={null}>
              <CatalogLoadMore currentLimit={pageLimit} hasMore={hasMore} />
            </Suspense>
          </>
        )}
      </div>
    </div>
  );
}
