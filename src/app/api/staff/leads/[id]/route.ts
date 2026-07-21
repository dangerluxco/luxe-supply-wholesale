import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import {
  getLeadById,
  updateLead,
  setLeadStatus,
  assignLead,
  listLeadActivities,
  LEAD_STATUSES,
  type LeadStatus,
  type LeadTest,
  type LeadProject,
} from "@/lib/firestore/leads";
import { featureDisabledResponse } from "@/lib/feature-gates";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const disabled = await featureDisabledResponse("leads");
  if (disabled) return disabled;
  const { id } = await ctx.params;
  try {
    const lead = await getLeadById(id);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    const activities = await listLeadActivities(id);
    return NextResponse.json({ ok: true, lead, activities });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load lead." },
      { status: 400 },
    );
  }
}

type PatchBody = {
  status?: string;
  assignedRepEmail?: string | null;
  assignedRepName?: string | null;
  company?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  industry?: string;
  estAnnualSpend?: number | string | null;
  notes?: string;
  testsAvailable?: LeadTest[];
  activeProjects?: LeadProject[];
};

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const disabled = await featureDisabledResponse("leads");
  if (disabled) return disabled;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const staff = { email: session.email, name: session.name };

  try {
    let lead = await getLeadById(id);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    if (body.status !== undefined) {
      const status = String(body.status).toLowerCase();
      if (!LEAD_STATUSES.includes(status as LeadStatus)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      lead = await setLeadStatus(id, status as LeadStatus, staff);
    }

    if (body.assignedRepEmail !== undefined) {
      lead = await assignLead(
        id,
        body.assignedRepEmail
          ? { email: body.assignedRepEmail, name: body.assignedRepName || body.assignedRepEmail }
          : null,
        staff,
      );
    }

    const fieldUpdates: Parameters<typeof updateLead>[1] = {};
    for (const key of ["company", "contactName", "email", "phone", "industry", "notes"] as const) {
      if (body[key] !== undefined) fieldUpdates[key] = body[key];
    }
    if (body.estAnnualSpend !== undefined) {
      fieldUpdates.estAnnualSpend =
        body.estAnnualSpend != null && body.estAnnualSpend !== "" ? Number(body.estAnnualSpend) : null;
    }
    if (body.testsAvailable !== undefined) fieldUpdates.testsAvailable = body.testsAvailable;
    if (body.activeProjects !== undefined) fieldUpdates.activeProjects = body.activeProjects;
    if (Object.keys(fieldUpdates).length > 0) {
      lead = await updateLead(id, fieldUpdates);
    }

    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update lead." },
      { status: 400 },
    );
  }
}
