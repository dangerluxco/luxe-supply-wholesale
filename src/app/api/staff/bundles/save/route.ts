import { logAudit } from "@/lib/firestore/audit";
import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import {
  getSuggestedLotById,
  saveSuggestedLot,
} from "@/lib/firestore/suggestedLots";
import { getCatalogProductBySku } from "@/lib/firestore/catalog";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    lotId?: string;
    buyerUsername?: string;
    buyerDisplayName?: string;
    publishedToAll?: boolean | string;
    name?: string;
    note?: string;
    lotPrice?: number | string;
    skus?: string[];
    titles?: string[];
    brands?: string[];
    imageUrls?: string[];
  };

  const lotId = String(body.lotId || "").trim();
  const buyerUsernameRaw = String(body.buyerUsername || "").trim();
  const publishedToAll =
    buyerUsernameRaw === "__all__" ||
    body.publishedToAll === true ||
    body.publishedToAll === "1";
  const buyerUsername = publishedToAll ? "" : buyerUsernameRaw;
  const buyerDisplayName = publishedToAll
    ? "All clients"
    : String(body.buyerDisplayName || "").trim();
  const title = String(body.name || "").trim() || "Suggested lot";
  const note = String(body.note || "").trim();
  const lotPrice = Number(body.lotPrice || 0);
  const rawSkus = Array.isArray(body.skus) ? body.skus.map(String) : [];
  const titles = Array.isArray(body.titles) ? body.titles.map(String) : [];
  const brands = Array.isArray(body.brands) ? body.brands.map(String) : [];
  const formImageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.map(String) : [];

  const seenSkus = new Set<string>();
  const uniqueEntries: { sku: string; index: number }[] = [];
  rawSkus.forEach((skuRaw, index) => {
    const sku = String(skuRaw || "").trim();
    if (!sku) return;
    const key = sku.toLowerCase();
    if (seenSkus.has(key)) return;
    seenSkus.add(key);
    uniqueEntries.push({ sku, index });
  });

  if ((!publishedToAll && !buyerUsername) || !uniqueEntries.length || !(lotPrice >= 0)) {
    return NextResponse.json(
      { error: "Audience, pieces, and lot price are required." },
      { status: 400 },
    );
  }

  if (lotId) {
    const existing = await getSuggestedLotById(lotId);
    if (!existing || existing.status !== "active") {
      return NextResponse.json(
        { error: "That suggested lot is not available to edit." },
        { status: 400 },
      );
    }
  }

  try {
    const items = await Promise.all(
      uniqueEntries.map(async ({ sku, index: i }) => {
        const product = await getCatalogProductBySku(sku, { includeBundled: true }).catch(
          () => null,
        );
        const resolvedUrls =
          product?.imageUrls?.length
            ? product.imageUrls
            : product?.imageUrl
              ? [product.imageUrl]
              : formImageUrls[i]
                ? [formImageUrls[i]!]
                : [];
        return {
          sku,
          title: titles[i] || product?.title || sku,
          brand: brands[i] || product?.brand || "",
          imageUrl: resolvedUrls[0] || null,
          imageUrls: resolvedUrls,
          quantity: 1,
        };
      }),
    );

    const saved = await saveSuggestedLot({
      lotId: lotId || undefined,
      buyerUsername,
      buyerDisplayName: buyerDisplayName || buyerUsername,
      publishedToAll,
      title,
      note,
      lotPrice,
      items,
      staffEmail: session.email,
    });

    await logAudit({
      actor: session,
      action: "bundle.saved",
      entity: "bundle",
      entityId: saved?.id || lotId || "",
      payload: { title, itemCount: items.length },
    });
    return NextResponse.json({
      ok: true,
      redirectTo: "/wholesaleportal/rep/bundles",
      lotId: saved?.id || lotId || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save bundle." },
      { status: 400 },
    );
  }
}