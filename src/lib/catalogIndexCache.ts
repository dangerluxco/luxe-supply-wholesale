import { listCatalogProducts } from "@/lib/firestore/catalog";

export type CatalogIndexItem = { sku: string; name: string; era: string; material: string };

// The buyer layout used to hydrate a 400-product catalog index from Firestore on
// EVERY storefront page view, only to feed the ⌘K search palette. A short-TTL
// in-process cache makes that one fetch per minute per Cloud Run instance —
// search suggestions tolerating 60s of staleness is a non-issue, and sold-out
// filtering still happens live at purchase time.
const TTL_MS = 60_000;

let cached: { at: number; items: CatalogIndexItem[] } | null = null;
let inflight: Promise<CatalogIndexItem[]> | null = null;

async function fetchIndex(): Promise<CatalogIndexItem[]> {
  const { products } = await listCatalogProducts(400);
  return products
    .filter((p) => !p.soldOut)
    .map((p) => ({ sku: p.sku, name: p.title, era: p.era, material: p.material }));
}

export async function getCatalogSearchIndex(): Promise<CatalogIndexItem[]> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.items;
  // Coalesce concurrent misses into one Firestore fetch.
  if (!inflight) {
    inflight = fetchIndex()
      .then((items) => {
        cached = { at: Date.now(), items };
        return items;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    return await inflight;
  } catch (err) {
    // Serve stale on failure rather than blanking the search palette.
    if (cached) return cached.items;
    throw err;
  }
}
