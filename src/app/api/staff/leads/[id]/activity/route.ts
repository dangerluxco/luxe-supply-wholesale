import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { addLeadActivity, getLeadById, type LeadActivityType } from "@/lib/firestore/leads";

export const dynamic = "force-dynamic";

const VALID_TYPES: LeadActivityType[] = ["note", "call", "meeting", "email"];

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { id } = await ctx.params;

  const lead = await getLeadById(id);
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { type?: string; text?: string };
  const type = VALID_TYPES.includes(body.type as LeadActivityType) ? (body.type as LeadActivityType) : "note";
  const text = String(body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Activity text is required." }, { status: 400 });
  }

  try {
    const activity = await addLeadActivity({
      leadId: id,
      type,
      text,
      staffEmail: session.email,
      staffName: session.name,
    });
    return NextResponse.json({ ok: true, activity });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add activity." },
      { status: 400 },
    );
  }
}
