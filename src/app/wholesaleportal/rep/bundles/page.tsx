import Link from "next/link";
import { getSession } from "@/lib/auth";
import { money } from "@/lib/format";
import { BundleBuilder } from "@/components/BundleBuilder";
import { MicroBadge } from "@/components/badges";
import { InfoTip } from "@/components/InfoTip";
import { PortalThumbnailTile } from "@/components/PortalItemLine";
import { listCatalogProducts } from "@/lib/firestore/catalog";
import { listBuyers } from "@/lib/firestore/buyers";
import { listSuggestedLots } from "@/lib/firestore/suggestedLots";
import { ArchiveLotButton } from "@/components/ArchiveLotButton";
import { BUNDLE_AUTO_EXPIRE_DAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Days until the nightly cron auto-archives this lot (clock resets on edit). */
function lotDaysLeft(lot: { updatedAt: string | null; createdAt: string | null }): number | null {
  const anchor = lot.updatedAt || lot.createdAt;
  if (!anchor) return null;
  const ts = Date.parse(anchor);
  if (!Number.isFinite(ts)) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.ceil((ts + BUNDLE_AUTO_EXPIRE_DAYS * dayMs - Date.now()) / dayMs);
}

function uniqueCatalogItems(
  products: {
    sku: string;
    title: string;
    price: number | null;
    cost: number | null;
    imageUrl: string | null;
    brand: string;
    held: boolean;
    soldOut: boolean;
  }[],
) {
  const seen = new Set<string>();
  const items: {
    sku: string;
    name: string;
    wholesalePrice: number;
    cost: number | null;
    imageUrl: string | null;
    brand: string;
    available: boolean;
  }[] = [];
  for (const p of products) {
    if (p.soldOut || p.price == null) continue;
    const sku = String(p.sku || "").trim();
    if (!sku) continue;
    const key = sku.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      sku,
      name: p.title,
      wholesalePrice: Math.round(p.price),
      cost: p.cost != null && Number.isFinite(p.cost) ? Math.round(p.cost) : null,
      imageUrl: p.imageUrl,
      brand: p.brand || "",
      available: !p.held,
    });
  }
  return items;
}

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

  const items = uniqueCatalogItems(products);

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

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/50 px-8 py-3 text-[12px] text-muted">
        <span>Live from Firestore · suggested lots for portal clients</span>
        <InfoTip label="How suggested lots / bundles work">
          While a suggested lot is active, its SKUs are hidden from individual sale on the
          storefront (buyers only get them via the lot). Default lot discount starts at 5%.
          Active lots older than 14 days are auto-archived each night so those SKUs return
          to the catalog. Archiving a lot manually has the same effect.
        </InfoTip>
      </div>

      <BundleBuilder items={items} buyers={buyerOpts} repName={session?.name || "Rep"} />

      <div className="border-t border-border px-8 py-8">
        <h2 className="mb-4 flex items-center gap-2 text-[18px] font-semibold text-ink">
          Active lots
          <InfoTip label="Active lot visibility">
            SKUs in these lots stay off the regular catalog until the lot is archived —
            manually, or automatically {BUNDLE_AUTO_EXPIRE_DAYS} days after its last edit
            (editing a lot resets its clock).
          </InfoTip>
        </h2>
        {existing.length === 0 ? (
          <p className="text-[13px] text-muted">No active suggested lots yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {existing.map((b) => {
              const daysLeft = lotDaysLeft(b);
              return (
              <div key={b.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-ink">{b.title}</span>
                  <div className="flex items-center gap-1.5">
                    {daysLeft != null && daysLeft <= 3 ? (
                      <MicroBadge tone="solid-gold">
                        {daysLeft <= 0 ? "EXPIRES TONIGHT" : `EXPIRES IN ${daysLeft}D`}
                      </MicroBadge>
                    ) : null}
                    <MicroBadge tone="solid-green">ACTIVE</MicroBadge>
                  </div>
                </div>
                <div className="mt-1.5 text-[11.5px] text-muted">
                  {b.items.length || b.itemCount} pieces ·{" "}
                  {b.publishedToAll
                    ? "All clients"
                    : `@${b.buyerUsername}${
                        b.buyerDisplayName && b.buyerDisplayName !== b.buyerUsername
                          ? ` · ${b.buyerDisplayName}`
                          : ""
                      }`}
                  {daysLeft != null
                    ? ` · auto-archives in ${Math.max(0, daysLeft)}d (editing resets the clock)`
                    : ""}
                </div>

                {b.items.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {b.items.slice(0, 6).map((it, i) => (
                      <PortalThumbnailTile
                        key={`${it.sku}-${i}`}
                        imageUrl={it.imageUrl || it.imageUrls?.[0] || null}
                        title={it.title}
                        sku={it.sku}
                        overlay={
                          i === 5 && b.items.length > 6 ? `+${b.items.length - 5}` : undefined
                        }
                      />
                    ))}
                  </div>
                ) : null}

                {b.note ? (
                  <p className="mt-2 line-clamp-2 text-[11px] text-muted">{b.note}</p>
                ) : null}

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="font-mono text-[15px] text-ink">
                    {b.lotPrice != null ? money(b.lotPrice) : "—"}
                  </span>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/wholesaleportal/rep/bundles/${b.id}/edit`}
                      className="text-[11px] uppercase tracking-[0.1em] text-muted hover:text-ink"
                    >
                      Edit
                    </Link>
                    <ArchiveLotButton lotId={b.id} />
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
