import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { BundleBuilder } from "@/components/BundleBuilder";
import { listCatalogProducts, getCatalogProductBySku } from "@/lib/firestore/catalog";
import { listBuyers } from "@/lib/firestore/buyers";
import { getSuggestedLotById } from "@/lib/firestore/suggestedLots";

export const dynamic = "force-dynamic";

export default async function EditBundlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    redirect("/wholesaleportal/sign-in");
  }

  const { id } = await params;
  const sp = await searchParams;
  const lot = await getSuggestedLotById(id);
  if (!lot || lot.status !== "active") notFound();

  const [{ products }, buyers] = await Promise.all([
    listCatalogProducts(200),
    listBuyers(),
  ]);

  // Lot SKUs are hidden from the live catalog while the lot is active — merge
  // them back so the builder can still show / keep the pieces already on the lot.
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

  const liveBySku = new Map(
    (
      await Promise.all(
        lot.items.map(async (it) => {
          const sku = String(it.sku || "").trim();
          if (!sku) return null;
          const live = await getCatalogProductBySku(sku, { includeBundled: true }).catch(
            () => null,
          );
          return [sku.toLowerCase(), live] as const;
        }),
      )
    ).filter((row): row is readonly [string, NonNullable<typeof row>[1]] => !!row),
  );

  for (const it of lot.items) {
    const sku = String(it.sku || "").trim();
    if (!sku) continue;
    const key = sku.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const live = liveBySku.get(key) || null;
    items.push({
      sku: live?.sku || sku,
      name: live?.title || it.title || sku,
      wholesalePrice: Math.round(live?.price ?? 0),
      cost:
        live?.cost != null && Number.isFinite(live.cost) ? Math.round(live.cost) : null,
      imageUrl: live?.imageUrl || it.imageUrl || it.imageUrls?.[0] || null,
      brand: live?.brand || it.brand || "",
      available: true,
    });
  }

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

  const buyerOpts = buyers.map((b) => ({
    username: b.username,
    displayName: b.displayName || b.username,
    company: b.company || "",
  }));

  // Ensure the lot’s buyer is in the dropdown even if their account list changed.
  if (
    lot.buyerUsername &&
    !buyerOpts.some((b) => b.username === lot.buyerUsername)
  ) {
    buyerOpts.unshift({
      username: lot.buyerUsername,
      displayName: lot.buyerDisplayName || lot.buyerUsername,
      company: "",
    });
  }

  return (
    <div>
      {sp.error ? (
        <div className="border-b border-danger/30 bg-danger/5 px-8 py-3 text-[12px] text-danger">
          {sp.error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface/50 px-8 py-3 text-[12px] text-muted">
        <Link
          href="/wholesaleportal/rep/bundles"
          className="uppercase tracking-[0.1em] text-muted hover:text-ink"
        >
          ← All lots
        </Link>
        <span>Editing · {lot.title}</span>
      </div>

      <BundleBuilder
        items={items}
        buyers={buyerOpts}
        repName={session.name || "Rep"}
        initialLot={{
          id: lot.id,
          title: lot.title,
          note: lot.note,
          buyerUsername: lot.buyerUsername,
          publishedToAll: lot.publishedToAll,
          lotPrice: lot.lotPrice,
          skus: lot.items.map((it) => it.sku),
        }}
      />
    </div>
  );
}
