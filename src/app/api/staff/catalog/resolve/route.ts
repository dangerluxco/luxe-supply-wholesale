import { NextResponse } from "next/server";
import { parseSkuBatch } from "@/lib/parseSkuBatch";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { resolveCuratedDraftItems } from "@/lib/firestore/catalog";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const session = await getSession();
  if (
    !session ||
    session.source !== "firestore" ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { skusText?: string };
  const batchInput = parseSkuBatch(String(body.skusText || ""));
  
  if (!batchInput.length) {
    return NextResponse.json({ error: "Paste at least one SKU." }, { status: 400 });
  }
  if (batchInput.length > 1000) {
    return NextResponse.json({ error: "Paste 1000 SKUs or fewer at a time." }, { status: 400 });
  }

  try {
    const skus = batchInput.map(b => b.sku);
    const { items, unresolvedSkus } = await resolveCuratedDraftItems(skus);
    
    // Apply manual price overrides from paste
    const itemsWithPriceOverrides = items.map((item) => {
      const override = batchInput.find(
        b => b.sku.toUpperCase() === item.sku.toUpperCase() && b.price != null
      );
      if (override?.price != null) {
        return {
          ...item,
          price: override.price,
          priceOverridden: true,
        };
      }
      return item;
    });

    return NextResponse.json({ 
      ok: true, 
      items: itemsWithPriceOverrides, 
      unresolvedSkus,
      batchCount: batchInput.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not resolve SKUs." },
      { status: 400 },
    );
  }
}
