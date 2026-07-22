import { listCatalogProducts, resolveStorefrontPricesForSkus } from "@/lib/firestore/catalog";
import { CatalogFilters } from "@/components/CatalogFilters";
import { CatalogProductGrid } from "@/components/CatalogProductGrid";
import { CatalogLoadMore } from "@/components/CatalogLoadMore";
import { PaginationControls } from "@/components/PaginationControls";
import { EmptyState } from "@/components/EmptyState";
import { BundleStrip } from "@/components/BundleStrip";
import { BundlesSection } from "@/components/BundlesSection";
import { PRODUCT_STATUS, ROLE } from "@/lib/constants";
import { getSession } from "@/lib/auth";
import { getActiveLotsForBuyer } from "@/lib/firestore/suggestedLots";
import { cartHoldSkus, getBuyerCart } from "@/lib/firestore/buyers";
import { listHoldAlertsForBuyer } from "@/lib/firestore/holdAlerts";
import { loadProductOverridesBySku, type ProductOverrides } from "@/lib/firestore/productOverrides";
import { matchesKeywords } from "@/lib/search";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";

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
  const category = one(sp.category).trim();
  const availability = one(sp.availability) || "available";
  const sort = one(sp.sort) || "newest";
  const pageLimit = Math.min(Math.max(Number(one(sp.limit)) || 200, 24), 800);
  const PER_PAGE = 24;
  const pageParam = Math.max(1, Math.floor(Number(one(sp.page)) || 1));

  // Never let a transient Firestore hiccup blank the whole page — degrade to an
  // empty catalog (same resilience pattern as WholesaleLayout's index fetch).
  let all: Awaited<ReturnType<typeof listCatalogProducts>>["products"] = [];
  let hasMore = false;
  let lots: Awaited<ReturnType<typeof getActiveLotsForBuyer>> = [];
  let cartSkus: string[] = [];
  let cartLotIds = new Set<string>();
  let wishlistSkus: string[] = [];
  try {
    const [catalogResult, lotsResult, cartResult, wishlistResult] = await Promise.all([
      listCatalogProducts(pageLimit, {
        buyerUsername: isBuyer ? session?.username : null,
      }),
      isBuyer && session.username
        ? getActiveLotsForBuyer(session.username)
        : Promise.resolve([]),
      isBuyer && session?.id
        ? getBuyerCart(session.id).catch(() => [])
        : Promise.resolve([]),
      isBuyer && session.username
        ? listHoldAlertsForBuyer(session.username).catch(() => [])
        : Promise.resolve([]),
    ]);
    all = catalogResult.products;
    hasMore = catalogResult.hasMore;
    lots = lotsResult;
    cartSkus = cartHoldSkus(cartResult);
    cartLotIds = new Set(
      cartResult.filter((i) => i.isSuggestedLot && i.lotId).map((i) => String(i.lotId)),
    );
    wishlistSkus = wishlistResult.map((w) => w.sku);
  } catch (err) {
    console.warn("[wholesale catalog] Firestore unavailable:", err instanceof Error ? err.message : err);
  }

  // Category/description are staff-entered overrides (no field on the base catalog
  // read model), so batch-resolve them for the currently-loaded page of SKUs —
  // needed for both search (FR-010) and the category filter (FR-011).
  let overridesBySku = new Map<string, ProductOverrides>();
  try {
    overridesBySku = await loadProductOverridesBySku(all.map((p) => p.sku));
  } catch (err) {
    console.warn(
      "[wholesale catalog] product overrides unavailable:",
      err instanceof Error ? err.message : err,
    );
  }
  const categoryFor = (sku: string) => overridesBySku.get(sku)?.category || "";
  const descriptionFor = (sku: string) => overridesBySku.get(sku)?.description || "";

  function withCounts(values: string[]): { name: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const v of values) {
      const key = v.trim();
      if (!key || key === "—") continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  const brands = withCounts(all.map((p) => p.brand));
  const categories = withCounts(all.map((p) => categoryFor(p.sku)));

  // Bundled SKUs are omitted from `all`, so resolve their individual wholesale
  // prices separately — otherwise BundleStrip falls back to lotPrice for both lines.
  const lotSkus = lots.flatMap((lot) => lot.items.map((it) => it.sku));
  let lotPrices = new Map<string, number>();
  if (lotSkus.length) {
    try {
      lotPrices = await resolveStorefrontPricesForSkus(lotSkus);
    } catch (err) {
      console.warn(
        "[wholesale catalog] lot prices unavailable:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const priceBySku = new Map<string, number>();
  for (const p of all) {
    if (p.price != null) {
      priceBySku.set(p.sku, p.price);
      priceBySku.set(p.sku.toUpperCase(), p.price);
    }
  }
  for (const [sku, price] of lotPrices) {
    priceBySku.set(sku, price);
    priceBySku.set(sku.toUpperCase(), price);
  }
  const catalogBySku = new Map(all.map((p) => [p.sku, p]));
  for (const p of all) catalogBySku.set(p.sku.toUpperCase(), p);

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
    if (category && norm(categoryFor(p.sku)) !== norm(category)) return false;

    if (q) {
      // Order-independent, partial, case-insensitive keyword match across every
      // searchable field — "prada nylon black" matches "Black Prada Nylon Bag".
      const hay = [p.title, p.sku, p.brand, descriptionFor(p.sku), categoryFor(p.sku)]
        .filter(Boolean)
        .join(" ");
      if (!matchesKeywords(hay, q)) return false;
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

  const eligibleLots = lots.filter((lot) => lot.lotPrice != null && lot.items.length > 0);

  // Paginate the filtered result set (filters run over everything loaded, so
  // page numbers always agree with the search/brand/category selection).
  const totalPages = Math.max(1, Math.ceil(products.length / PER_PAGE));
  const page = Math.min(pageParam, totalPages);
  const pageProducts = products.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const cards = pageProducts.map((p) => ({
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
      {/* Staff catalog edits land without the buyer refreshing: instant paint
          from the client cache, then a silent catch-up fetch (SWR pattern). */}
      <AutoRefresh intervalMs={45_000} />
      <Suspense
        fallback={
          <div className="border-b border-border bg-surface/95 px-8 py-4">
            <div className="h-10 animate-pulse rounded-chip bg-ground" />
          </div>
        }
      >
        <CatalogFilters
          brands={brands}
          categories={categories}
          resultCount={products.length}
          totalCount={all.length}
          pricesVisible={pricesVisible}
          hasMore={hasMore}
        />
      </Suspense>

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

        <BundlesSection count={eligibleLots.length}>
          {eligibleLots.map((lot) => {
            const individualSum = lot.items.reduce((s, it) => {
              const unit =
                priceBySku.get(it.sku) ??
                priceBySku.get(it.sku.toUpperCase()) ??
                0;
              return s + Math.round(Number(unit) || 0);
            }, 0);
            return (
              <BundleStrip
                key={lot.id}
                inCart={cartLotIds.has(lot.id)}
                lot={{
                  id: lot.id,
                  title: lot.title,
                  lotPrice: Math.round(Number(lot.lotPrice) || 0),
                  individualSum: Math.round(individualSum),
                  items: lot.items.map((it) => {
                    const cat =
                      catalogBySku.get(it.sku) ||
                      catalogBySku.get(it.sku.toUpperCase());
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
        </BundlesSection>

        {products.length === 0 ? (
          <EmptyState
            title="No items match your search or filters."
            hint="Try clearing filters or broadening your search — the collection turns over quickly."
            className="mt-4"
          />
        ) : (
          <>
            <CatalogProductGrid
              products={cards}
              pricesVisible={pricesVisible}
              cartSkus={cartSkus}
              wishlistSkus={wishlistSkus}
            />
            <Suspense fallback={null}>
              <PaginationControls
                page={page}
                totalPages={totalPages}
                totalItems={products.length}
                perPage={PER_PAGE}
              />
            </Suspense>
            {page >= totalPages ? (
              <Suspense fallback={null}>
                <CatalogLoadMore currentLimit={pageLimit} hasMore={hasMore} />
              </Suspense>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
