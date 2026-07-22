import { logAudit } from "@/lib/firestore/audit";
import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getLeadById, markLeadConverted } from "@/lib/firestore/leads";
import { createBuyer } from "@/lib/firestore/buyers";

export const dynamic = "force-dynamic";

type ConvertBody = { username?: string; password?: string };

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const lead = await getLeadById(id);
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (lead.convertedBuyerId) {
    return NextResponse.json({ error: "This lead has already been converted." }, { status: 400 });
  }
  if (!lead.email) {
    return NextResponse.json(
      { error: "Add a contact email to this lead before converting it." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as ConvertBody;

  try {
    const { buyer, temporaryPassword } = await createBuyer({
      email: lead.email,
      username: body.username || "",
      password: body.password || "",
      displayName: lead.contactName || lead.company,
      company: lead.company,
      phone: lead.phone,
      createdBy: session.email,
    });

    const updated = await markLeadConverted(
      id,
      { id: buyer.id, username: buyer.username },
      { email: session.email, name: session.name },
    );

    await logAudit({
      actor: session,
      action: "lead.converted",
      entity: "lead",
      entityId: id,
      payload: { buyerUsername: buyer.username },
    });
    return NextResponse.json({
      ok: true,
      lead: updated,
      buyer: { id: buyer.id, username: buyer.username },
      temporaryPassword,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not convert lead to client." },
      { status: 400 },
    );
  }
}
