import { listCatalogProducts, getCatalogSettingsState } from "@/lib/firestore/catalog";
import { CatalogSettingsForm } from "@/components/CatalogSettingsForm";
import { money } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  let products: Awaited<ReturnType<typeof listCatalogProducts>>["products"] = [];
  let settings: Awaited<ReturnType<typeof getCatalogSettingsState>> = {
    mode: "all",
    skus: [],
    curatedCatalog: null,
    orgName: "LuxeSupply",
  };
  try {
    const [productsResult, settingsResult] = await Promise.all([
      listCatalogProducts(48),
      getCatalogSettingsState(),
    ]);
    products = productsResult.products;
    settings = settingsResult;
  } catch (err) {
    console.warn("[rep catalog] Firestore unavailable:", err instanceof Error ? err.message : err);
  }

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
        <h2 className="text-[16px] font-semibold text-ink">Recent products</h2>
        <span className="text-[12px] text-muted">{products.length} shown</span>
      </div>

      {products.length === 0 ? (
        <EmptyState title="No products found." hint="Check uploadDirectory luxesupply in uploadHistory." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p, i) => (
            <div key={`${p.sku}-${i}`} className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="aspect-[4/3] bg-ground">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center font-mono text-[11px] text-muted">
                    No image
                  </div>
                )}
              </div>
              <div className="space-y-1 p-3.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{p.sku}</div>
                <div className="line-clamp-2 text-[13px] font-semibold text-ink">{p.title}</div>
                <div className="text-[11px] text-secondary">{p.brand || "—"}</div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-mono text-[12px] text-ink">
                    {p.price != null ? money(Math.round(p.price)) : p.priceLabel || "—"}
                  </span>
                  {p.hostCompAvgUsd != null ? (
                    <span className="font-mono text-[10px] text-muted">
                      comps ~{money(Math.round(p.hostCompAvgUsd))}
                    </span>
                  ) : null}
                </div>
                {p.soldOut ? (
                  <div className="text-[10px] uppercase tracking-[0.1em] text-danger">Sold</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
