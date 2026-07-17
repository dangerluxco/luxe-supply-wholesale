import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { resolveCurationSkusForBuilder } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
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

  try {
    const { items, missing } = await resolveCurationSkusForBuilder(skus);
    return NextResponse.json({ ok: true, items, missing });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not resolve SKUs." },
      { status: 400 },
    );
  }
}
