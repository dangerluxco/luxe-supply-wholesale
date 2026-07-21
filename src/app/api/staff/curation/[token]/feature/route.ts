import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { setCurationHero } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { sku?: string };
  if (!body.sku) return NextResponse.json({ error: "Missing SKU." }, { status: 400 });

  try {
    const result = await setCurationHero(token, body.sku);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not feature that item." },
      { status: 400 },
    );
  }
}
