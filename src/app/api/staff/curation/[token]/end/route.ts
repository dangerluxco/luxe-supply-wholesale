import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { endCurationSession } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  try {
    const result = await endCurationSession(token);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not end session." },
      { status: 400 },
    );
  }
}
