import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { createLead, listLeads, autoRouteLead, type LeadStatus } from "@/lib/firestore/leads";
import { listStaff } from "@/lib/firestore/staff";
import { featureDisabledResponse } from "@/lib/feature-gates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const disabled = await featureDisabledResponse("leads");
  if (disabled) return disabled;

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "all") as LeadStatus | "all";
  const assignedRepEmail = url.searchParams.get("rep") || undefined;
  const search = url.searchParams.get("q") || undefined;
  const fromIso = url.searchParams.get("from") || undefined;
  const toIso = url.searchParams.get("to") || undefined;

  try {
    const leads = await listLeads({ status, assignedRepEmail, search, fromIso, toIso });
    return NextResponse.json({ ok: true, leads });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load leads." },
      { status: 400 },
    );
  }
}

type CreateBody = {
  company?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  industry?: string;
  estAnnualSpend?: number | string | null;
  assignedRepEmail?: string | null;
  assignedRepName?: string | null;
  notes?: string;
};

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const disabled = await featureDisabledResponse("leads");
  if (disabled) return disabled;

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const company = String(body.company || "").trim();
  if (!company) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }
  const estAnnualSpend =
    body.estAnnualSpend != null && body.estAnnualSpend !== "" ? Number(body.estAnnualSpend) : null;

  try {
    let assignedRepEmail = body.assignedRepEmail || null;
    let assignedRepName = body.assignedRepName || null;
    let routingReason: string | null = assignedRepEmail ? "Manually assigned" : null;

    if (!assignedRepEmail) {
      const [staffList, openLeads] = await Promise.all([
        listStaff(),
        listLeads({ status: "all", limit: 500 }),
      ]);
      const activeStaff = staffList
        .filter((s) => s.status !== "disabled")
        .map((s) => ({ email: s.email, displayName: s.displayName, role: s.role }));
      const openOnly = openLeads.filter((l) => l.status !== "won" && l.status !== "lost");
      const routed = await autoRouteLead(estAnnualSpend, activeStaff, openOnly);
      if (routed) {
        assignedRepEmail = routed.repEmail;
        assignedRepName = routed.repName;
        routingReason = routed.reason;
      }
    }

    const lead = await createLead({
      company,
      contactName: body.contactName || "",
      email: body.email || "",
      phone: body.phone || "",
      industry: body.industry || "",
      estAnnualSpend,
      assignedRepEmail,
      assignedRepName,
      routingReason,
      notes: body.notes || "",
      createdByEmail: session.email,
      createdByName: session.name,
    });
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create lead." },
      { status: 400 },
    );
  }
}
