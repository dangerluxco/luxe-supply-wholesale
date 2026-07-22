import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { saveCuratedCatalog, setCatalogMode } from "@/lib/firestore/catalog";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

/**
 * "Clear entire catalog": empties the curated catalog AND pins the storefront
 * to curated mode, so buyers see an intentionally empty catalog until staff
 * publish a fresh vetted list. (Clearing just the working list used to fall
 * through to showing the full raw inventory.)
 */
export async function POST() {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  try {
    await saveCuratedCatalog({ items: [], unresolvedSkus: [], updatedBy: session.email });
    await setCatalogMode("sku_list");
    await logAudit({
      actor: session,
      action: "catalog.cleared_all",
      entity: "catalog",
      entityId: "curated",
    });
    return NextResponse.json({
      ok: true,
      message: "Storefront catalog cleared — buyers now see an empty catalog until you publish a new list.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not clear the catalog." },
      { status: 400 },
    );
  }
}
