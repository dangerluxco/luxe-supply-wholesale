import { getSession } from "@/lib/auth";
import { money } from "@/lib/format";
import { BundleBuilder } from "@/components/BundleBuilder";
import { MicroBadge } from "@/components/badges";
import { listCatalogProducts } from "@/lib/firestore/catalog";
import { listBuyers } from "@/lib/firestore/buyers";
import { listSuggestedLots } from "@/lib/firestore/suggestedLots";
import { ArchiveLotButton } from "@/components/ArchiveLotButton";

export const dynamic = "force-dynamic";

export default async function BundlesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  const sp = await searchParams;

  const [{ products }, buyers, existing] = await Promise.all([
    listCatalogProducts(200),
    listBuyers(),
    listSuggestedLots({ status: "active" }),
  ]);

  const items = products
    .filter((p) => !p.soldOut && p.price != null)
    .map((p) => ({
      sku: p.sku,
      name: p.title,
      wholesalePrice: Math.round(p.price ?? 0),
      imageUrl: p.imageUrl,
      brand: p.brand || "",
      available: !p.held,
    }));

  const buyerOpts = buyers.map((b) => ({
    username: b.username,
    displayName: b.displayName || b.username,
    company: b.company || "",
  }));

  return (
    <div>
      {sp.error ? (
        <div className="border-b border-danger/30 bg-danger/5 px-8 py-3 text-[12px] text-danger">
          {sp.error}
        </div>
      ) : null}

      <div className="border-b border-border bg-surface/50 px-8 py-3 text-[12px] text-muted">
        Live from Firestore · suggested lots for portal clients (same as legacy storefront)
      </div>

      <BundleBuilder items={items} buyers={buyerOpts} repName={session?.name || "Rep"} />

      <div className="border-t border-border px-8 py-8">
        <h2 className="mb-4 text-[18px] font-semibold text-ink">Active lots</h2>
        {existing.length === 0 ? (
          <p className="text-[13px] text-muted">No active suggested lots yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {existing.map((b) => (
              <div key={b.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-ink">{b.title}</span>
                  <MicroBadge tone="solid-green">ACTIVE</MicroBadge>
                </div>
                <div className="mt-1.5 text-[11.5px] text-muted">
                  {b.itemCount} pieces · @{b.buyerUsername}
                  {b.buyerDisplayName && b.buyerDisplayName !== b.buyerUsername
                    ? ` · ${b.buyerDisplayName}`
                    : ""}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[15px] text-ink">
                    {b.lotPrice != null ? money(b.lotPrice) : "—"}
                  </span>
                  <ArchiveLotButton lotId={b.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
