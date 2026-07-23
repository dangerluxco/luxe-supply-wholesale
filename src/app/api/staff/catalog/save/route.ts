import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import {
  saveCuratedCatalog,
  type CuratedCatalogItem,
} from "@/lib/firestore/catalog";
import { warmupOptimizedImages } from "@/lib/imageWarmup";

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

  const body = (await request.json().catch(() => ({}))) as {
    items?: CuratedCatalogItem[];
    unresolvedSkus?: string[];
  };
  if (!Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ error: "Add at least one item before saving." }, { status: 400 });
  }

  // Refuse unresolved rows: a manually priced SKU that isn't in inventory would
  // pass the storefront's `price != null` filter and sell a phantom item. The
  // client blocks this too; this is the backstop.
  const unresolved = body.items.filter((i) => !i?.inDb).map((i) => String(i?.sku || "?"));
  if (unresolved.length) {
    return NextResponse.json(
      {
        error: `${unresolved.length} SKU${unresolved.length === 1 ? "" : "s"} not found in inventory — remove or fix before saving: ${unresolved.join(", ")}`,
      },
      { status: 400 },
    );
  }

  try {
    await saveCuratedCatalog({
      items: body.items,
      unresolvedSkus: Array.isArray(body.unresolvedSkus) ? body.unresolvedSkus : [],
      updatedBy: session.email,
    });
    // Pre-generate optimized variants so the first buyer view is already cached.
    warmupOptimizedImages(body.items.map((i) => i.imageUrl));
    return NextResponse.json({
      ok: true,
      message: `Curated catalog saved — ${body.items.length} item${
        body.items.length === 1 ? "" : "s"
      } now live.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save curated catalog." },
      { status: 400 },
    );
  }
}
