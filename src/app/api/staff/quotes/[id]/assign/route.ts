import { addQuoteActivity } from "@/lib/firestore/quoteActivities";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { claimQuote } from "@/lib/firestore/quotes";
import { findStaffByEmail } from "@/lib/firestore/staff";

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

  const body = (await request.json().catch(() => ({}))) as { staffEmail?: string };
  const staffEmail = String(body.staffEmail || "").trim().toLowerCase();
  if (!staffEmail) {
    return NextResponse.json({ error: "Missing staff email." }, { status: 400 });
  }

  const staff = await findStaffByEmail(staffEmail);
  if (!staff || staff.status === "disabled") {
    return NextResponse.json({ error: "Staff member not found or disabled." }, { status: 400 });
  }

  try {
    await addQuoteActivity({
      quoteId,
      type: "claim",
      text: `Assigned to ${staff.displayName || staff.email} by ${session.name || session.email}`,
      staffEmail: session.email,
      staffName: session.name || session.email,
    }).catch(() => {});
    await claimQuote(quoteId, {
      email: staff.email,
      name: staff.displayName || staff.email,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not assign request." },
      { status: 400 },
    );
  }
}
