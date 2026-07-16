import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { updateQuoteStatus } from "@/lib/firestore/quotes";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (
    !session ||
    session.source !== "firestore" ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id } = await params;
  const quoteId = String(id || "").trim();
  if (!quoteId) {
    return NextResponse.json({ error: "Missing order request." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { adminNotes?: string };
  const adminNotes = String(body.adminNotes ?? "");

  try {
    await updateQuoteStatus(quoteId, { adminNotes }, session.email);
    return NextResponse.json({ ok: true, message: "Notes saved." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save notes." },
      { status: 400 },
    );
  }
}
