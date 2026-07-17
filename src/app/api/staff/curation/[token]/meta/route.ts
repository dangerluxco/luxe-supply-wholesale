import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { updateCurationMeta } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    clientName?: string;
    invoiceDate?: string;
    note?: string;
  };

  try {
    const result = await updateCurationMeta(token, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update details." },
      { status: 400 },
    );
  }
}
