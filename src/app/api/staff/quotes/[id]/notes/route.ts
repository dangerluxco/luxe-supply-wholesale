import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { appendQuoteNote, updateQuoteStatus } from "@/lib/firestore/quotes";

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

  const body = (await request.json().catch(() => ({}))) as {
    adminNotes?: string;
    append?: string;
  };

  try {
    // Default path: append a stamped note (race-safe). Full overwrite stays
    // available for explicit clean-ups via the form's "Edit all" mode.
    if (body.append != null) {
      const adminNotes = await appendQuoteNote(quoteId, String(body.append), {
        email: session.email,
        name: session.name,
      });
      return NextResponse.json({ ok: true, message: "Note added.", adminNotes });
    }
    const adminNotes = String(body.adminNotes ?? "");
    await updateQuoteStatus(quoteId, { adminNotes }, session.email);
    return NextResponse.json({ ok: true, message: "Notes saved.", adminNotes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save notes." },
      { status: 400 },
    );
  }
}
