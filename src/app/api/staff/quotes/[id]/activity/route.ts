import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { addQuoteActivity } from "@/lib/firestore/quoteActivities";

export const dynamic = "force-dynamic";

/** Append a manual note to an order request's activity thread. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const quoteId = String(id || "").trim();
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = String(body.text || "").trim();
  if (!quoteId || !text) {
    return NextResponse.json({ error: "Write a note first." }, { status: 400 });
  }
  try {
    await addQuoteActivity({
      quoteId,
      type: "note",
      text,
      staffEmail: session.email,
      staffName: session.name || session.email,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add note." },
      { status: 400 },
    );
  }
}
