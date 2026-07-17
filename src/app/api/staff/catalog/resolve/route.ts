import { NextResponse } from "next/server";
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
  const skus = String(body.skusText || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!skus.length) {
    return NextResponse.json({ error: "Paste at least one SKU." }, { status: 400 });
  }
  if (skus.length > 1000) {
    return NextResponse.json({ error: "Paste 1000 SKUs or fewer at a time." }, { status: 400 });
  }

  try {
    const { items, unresolvedSkus } = await resolveCuratedDraftItems(skus);
    return NextResponse.json({ ok: true, items, unresolvedSkus });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not resolve SKUs." },
      { status: 400 },
    );
  }
}
