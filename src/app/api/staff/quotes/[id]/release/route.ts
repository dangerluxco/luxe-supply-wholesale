import { addQuoteActivity } from "@/lib/firestore/quoteActivities";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { releaseQuoteClaim } from "@/lib/firestore/quotes";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (
    !session ||
    session.source !== "firestore" ||
    session.role === ROLE.BUYER ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id } = await params;
  const quoteId = String(id || "").trim();
  if (!quoteId) {
    return NextResponse.json({ error: "Missing order request." }, { status: 400 });
  }

  try {
    await releaseQuoteClaim(quoteId, session.email);
    await addQuoteActivity({
      quoteId,
      type: "claim",
      text: `Released by ${session.name || session.email}`,
      staffEmail: session.email,
      staffName: session.name || session.email,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not release claim." },
      { status: 400 },
    );
  }
}
