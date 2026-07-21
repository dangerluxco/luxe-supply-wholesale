import { listCatalogProducts, getCatalogSettingsState } from "@/lib/firestore/catalog";
import { CatalogSettingsForm } from "@/components/CatalogSettingsForm";
import { StaffCatalogGrid, type StaffCatalogCard } from "@/components/StaffCatalogGrid";
import { PRODUCT_STATUS } from "@/lib/constants";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type SP = { [k: string]: string | string[] | undefined };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const pageLimit = Math.min(Math.max(Number(one(sp.limit)) || 240, 24), 800);
  const PER_PAGE = 24;
  const pageParam = Math.max(1, Math.floor(Number(one(sp.page)) || 1));

  let products: Awaited<ReturnType<typeof listCatalogProducts>>["products"] = [];
  let hasMore = false;
  let settings: Awaited<ReturnType<typeof getCatalogSettingsState>> = {
    mode: "all",
    skus: [],
    curatedCatalog: null,
    orgName: "LuxeSupply",
  };
  try {
    const [productsResult, settingsResult] = await Promise.all([
      listCatalogProducts(pageLimit),
      getCatalogSettingsState(),
    ]);
    products = productsResult.products;
    hasMore = productsResult.hasMore;
    settings = settingsResult;
  } catch (err) {
    console.warn("[rep catalog] Firestore unavailable:", err instanceof Error ? err.message : err);
  }

  const totalPages = Math.max(1, Math.ceil(products.length / PER_PAGE));
  const page = Math.min(pageParam, totalPages);
  const pageProducts = products.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Same card shape the buyer storefront uses (see wholesale/page.tsx) plus a
  // staff-only `cost` field, so this grid renders with the identical ProductCard.
  const cards: StaffCatalogCard[] = pageProducts.map((p) => ({
    sku: p.sku,
    name: p.title,
    wholesalePrice: Math.round(p.price ?? 0),
    cost: p.cost,
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
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Catalog</h1>
        <span className="text-[12px] text-muted">
          {settings.orgName} · live Firestore inventory (not synced to Prisma)
        </span>
      </div>

      <CatalogSettingsForm mode={settings.mode} curatedCatalog={settings.curatedCatalog} />

      <div className="mt-10 mb-4 flex items-baseline gap-3">
        <h2 className="text-[16px] font-semibold text-ink">Complete catalog</h2>
        <span className="text-[12px] text-muted">{products.length} loaded · click any item to edit</span>
      </div>

      {products.length === 0 ? (
        <EmptyState title="No products found." hint="Check uploadDirectory luxesupply in uploadHistory." />
      ) : (
        <StaffCatalogGrid
          products={cards}
          currentLimit={pageLimit}
          hasMore={hasMore}
          page={page}
          totalPages={totalPages}
          totalItems={products.length}
          perPage={PER_PAGE}
        />
      )}
    </div>
  );
}
