import { NextResponse } from "next/server";
import { getCurationShareForBuyer } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

/** Public (token-only): initial load + poll for the buyer curation viewer. */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const share = await getCurationShareForBuyer(token);
  if (!share) {
    return NextResponse.json({ error: "This curated catalog is unavailable." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, share });
}
