import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { resolveCurationSkusForBuilder } from "@/lib/firestore/curation";
import { parseSkuBatch } from "@/lib/parseSkuBatch";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { skusText?: string };
  // Spreadsheet-friendly: SKU-only lines OR two pasted columns (SKU + price),
  // same parser as the catalog import.
  const parsed = parseSkuBatch(String(body.skusText || ""));
  if (!parsed.length) {
    return NextResponse.json({ error: "Paste at least one SKU." }, { status: 400 });
  }

  try {
    const { items, missing } = await resolveCurationSkusForBuilder(parsed.map((p) => p.sku));
    // Pasted prices override the resolved defaults (staff can still edit inline).
    const priceBySku = new Map(
      parsed.filter((p) => p.price !== undefined).map((p) => [p.sku.toUpperCase(), p.price!]),
    );
    const priced = items.map((it) => {
      const pasted = priceBySku.get(String(it.sku).toUpperCase());
      return pasted !== undefined ? { ...it, price: pasted } : it;
    });
    return NextResponse.json({ ok: true, items: priced, missing });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not resolve SKUs." },
      { status: 400 },
    );
  }
}
