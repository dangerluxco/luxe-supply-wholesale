import { NextResponse } from "next/server";
import { updateCurationNote } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

/** Public (token-only): anyone with the link may set an item note until the session ends/expires. */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { sku?: string; note?: string };
  if (!body.sku) return NextResponse.json({ error: "Missing SKU." }, { status: 400 });

  try {
    const result = await updateCurationNote(token, body.sku, String(body.note || ""));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save note." },
      { status: 400 },
    );
  }
}
