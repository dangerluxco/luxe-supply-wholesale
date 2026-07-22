import { addQuoteActivity } from "@/lib/firestore/quoteActivities";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { QUOTE_STATUSES, ROLE } from "@/lib/constants";
import {
  finalizeInvoiceRequestAsSold,
  updateQuoteStatus,
} from "@/lib/firestore/quotes";
import { releaseAllHoldsForQuote } from "@/lib/firestore/holds";

export const dynamic = "force-dynamic";

function requireStaff() {
  return getSession().then((session) => {
    if (
      !session ||
      session.source !== "firestore" ||
      (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
    ) {
      return null;
    }
    return session;
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id } = await params;
  const quoteId = String(id || "").trim();
  if (!quoteId) {
    return NextResponse.json({ error: "Missing order request." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const next = String(body.status || "").toLowerCase();
  if (!(QUOTE_STATUSES as readonly string[]).includes(next)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    await updateQuoteStatus(quoteId, { status: next }, session.email);
    await addQuoteActivity({
      quoteId,
      type: "status_change",
      text: `Status changed to ${next.replace(/_/g, " ")}`,
      staffEmail: session.email,
      staffName: session.name || session.email,
    }).catch(() => {});

    if (next === "quoted") {
      try {
        await finalizeInvoiceRequestAsSold(quoteId, session.email);
      } catch (err) {
        console.warn("[api status] finalize sold:", err);
      }
    } else if (next === "declined" || next === "timed_out" || next === "closed") {
      try {
        await releaseAllHoldsForQuote(quoteId);
      } catch (err) {
        console.warn("[api status] release holds:", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update status." },
      { status: 400 },
    );
  }
}
