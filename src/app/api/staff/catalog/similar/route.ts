import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { findSimilarCatalogItems } from "@/lib/firestore/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const sku = url.searchParams.get("sku") || "";
  const exclude = (url.searchParams.get("exclude") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sku.trim()) {
    return NextResponse.json({ error: "Missing SKU." }, { status: 400 });
  }

  try {
    const items = await findSimilarCatalogItems(sku, exclude);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not find similar items." },
      { status: 400 },
    );
  }
}
