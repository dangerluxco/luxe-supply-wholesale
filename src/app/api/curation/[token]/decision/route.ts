import { NextResponse } from "next/server";
import { updateCurationDecision } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

/** Public (token-only): anyone with the link may set a decision until the session ends/expires. */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { sku?: string; decision?: string };
  if (!body.sku) return NextResponse.json({ error: "Missing SKU." }, { status: 400 });

  try {
    const result = await updateCurationDecision(token, body.sku, String(body.decision || ""));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save decision." },
      { status: 400 },
    );
  }
}
