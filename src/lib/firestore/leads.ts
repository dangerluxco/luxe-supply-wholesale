// Native Firestore lead-tracking module — an independent CRM to replace
// HubSpot for business-development leads (FR-016). Mirrors the conventions
// already established by quotes.ts / invoices.ts / staff.ts in this same
// directory rather than reviving the legacy (unused) Prisma Lead model.
import { getDb, toIso, WHOLESALE_ORG_SLUG } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import { routeLead, type RoutableRep } from "@/lib/routing";
import { tierForSpend } from "@/lib/constants";

export const LEAD_STATUSES = ["new", "contacted", "qualifying", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type Lead = {
  id: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  industry: string;
  estAnnualSpend: number | null;
  status: LeadStatus;
  assignedRepEmail: string | null;
  assignedRepName: string | null;
  routingReason: string | null;
  notes: string;
  convertedBuyerId: string | null;
  convertedBuyerUsername: string | null;
  createdByEmail: string;
  createdByName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type LeadActivityType = "note" | "call" | "meeting" | "email" | "status_change" | "created" | "converted";

export type LeadActivity = {
  id: string;
  leadId: string;
  type: LeadActivityType;
  text: string;
  staffEmail: string;
  staffName: string;
  createdAt: string | null;
};

function takeText(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function serializeLead(id: string, d: Record<string, unknown>): Lead {
  const status = takeText(d.status) as LeadStatus;
  return {
    id,
    company: takeText(d.company),
    contactName: takeText(d.contactName),
    email: takeText(d.email),
    phone: takeText(d.phone),
    industry: takeText(d.industry),
    estAnnualSpend:
      typeof d.estAnnualSpend === "number" && Number.isFinite(d.estAnnualSpend) ? d.estAnnualSpend : null,
    status: LEAD_STATUSES.includes(status) ? status : "new",
    assignedRepEmail: d.assignedRepEmail ? takeText(d.assignedRepEmail) : null,
    assignedRepName: d.assignedRepName ? takeText(d.assignedRepName) : null,
    routingReason: d.routingReason ? takeText(d.routingReason) : null,
    notes: takeText(d.notes),
    convertedBuyerId: d.convertedBuyerId ? takeText(d.convertedBuyerId) : null,
    convertedBuyerUsername: d.convertedBuyerUsername ? takeText(d.convertedBuyerUsername) : null,
    createdByEmail: takeText(d.createdByEmail),
    createdByName: takeText(d.createdByName),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

function serializeActivity(id: string, d: Record<string, unknown>): LeadActivity {
  return {
    id,
    leadId: takeText(d.leadId),
    type: (takeText(d.type) as LeadActivityType) || "note",
    text: takeText(d.text),
    staffEmail: takeText(d.staffEmail),
    staffName: takeText(d.staffName),
    createdAt: toIso(d.createdAt),
  };
}

async function logActivity(opts: {
  leadId: string;
  type: LeadActivityType;
  text: string;
  staffEmail: string;
  staffName: string;
}): Promise<void> {
  const org = await getLuxesupplyOrg();
  const ref = getDb().collection("salesPortalLeadActivities").doc();
  await ref.set({
    orgSlug: WHOLESALE_ORG_SLUG,
    organizationId: org.id,
    leadId: opts.leadId,
    type: opts.type,
    text: opts.text,
    staffEmail: opts.staffEmail,
    staffName: opts.staffName,
    createdAt: new Date(),
  });
}

/** Auto-routes a new lead to a rep by estimated spend tier + current open-lead
 * load, using the same routeLead() logic as the rest of the app — falls back
 * to no assignment if there are no active staff to route to. */
export async function autoRouteLead(
  estAnnualSpend: number | null,
  staff: { email: string; displayName: string; role: "admin" | "staff" }[],
  openLeads: Lead[],
): Promise<{ repEmail: string; repName: string; reason: string } | null> {
  if (!staff.length) return null;
  const loadByEmail = new Map<string, number>();
  for (const l of openLeads) {
    if (!l.assignedRepEmail) continue;
    loadByEmail.set(l.assignedRepEmail, (loadByEmail.get(l.assignedRepEmail) || 0) + 1);
  }
  const reps: RoutableRep[] = staff.map((s) => ({
    id: s.email,
    name: s.displayName || s.email,
    isSenior: s.role === "admin",
    load: loadByEmail.get(s.email) || 0,
  }));
  const tier = tierForSpend(estAnnualSpend ?? 0);
  const picked = routeLead(tier, reps);
  if (!picked) return null;
  const rep = staff.find((s) => s.email === picked.repId);
  return { repEmail: picked.repId, repName: rep?.displayName || picked.repId, reason: picked.reason };
}

export async function createLead(opts: {
  company: string;
  contactName: string;
  email?: string;
  phone?: string;
  industry?: string;
  estAnnualSpend?: number | null;
  assignedRepEmail?: string | null;
  assignedRepName?: string | null;
  routingReason?: string | null;
  notes?: string;
  createdByEmail: string;
  createdByName: string;
}): Promise<Lead> {
  const company = takeText(opts.company);
  if (!company) throw new Error("Company name is required.");

  const org = await getLuxesupplyOrg();
  const ref = getDb().collection("salesPortalLeads").doc();
  const now = new Date();
  const payload = {
    orgSlug: WHOLESALE_ORG_SLUG,
    organizationId: org.id,
    company,
    contactName: takeText(opts.contactName),
    email: takeText(opts.email),
    phone: takeText(opts.phone),
    industry: takeText(opts.industry),
    estAnnualSpend:
      opts.estAnnualSpend != null && Number.isFinite(opts.estAnnualSpend) ? opts.estAnnualSpend : null,
    status: "new" as LeadStatus,
    assignedRepEmail: opts.assignedRepEmail || null,
    assignedRepName: opts.assignedRepName || null,
    routingReason: opts.routingReason || null,
    notes: takeText(opts.notes),
    convertedBuyerId: null,
    convertedBuyerUsername: null,
    createdByEmail: opts.createdByEmail,
    createdByName: opts.createdByName,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(payload);

  await logActivity({
    leadId: ref.id,
    type: "created",
    text: opts.assignedRepEmail
      ? `Lead created and assigned to ${opts.assignedRepName || opts.assignedRepEmail}${
          opts.routingReason ? ` (${opts.routingReason})` : ""
        }.`
      : "Lead created.",
    staffEmail: opts.createdByEmail,
    staffName: opts.createdByName,
  });

  return serializeLead(ref.id, payload);
}

export async function getLeadById(id: string): Promise<Lead | null> {
  if (!id) return null;
  const snap = await getDb().collection("salesPortalLeads").doc(id).get();
  if (!snap.exists) return null;
  return serializeLead(snap.id, snap.data() || {});
}

/** Loaded in a bounded batch (org-scoped, newest first) and filtered in memory —
 * consistent with how the catalog/performance pages handle filtering at this
 * app's scale, and avoids needing several composite Firestore indexes. */
export async function listLeads(opts?: {
  status?: LeadStatus | "all";
  assignedRepEmail?: string;
  search?: string;
  fromIso?: string;
  toIso?: string;
  limit?: number;
}): Promise<Lead[]> {
  const org = await getLuxesupplyOrg();
  const db = getDb();
  const limitCount = Math.min(Math.max(opts?.limit || 300, 1), 1000);

  let snap;
  try {
    snap = await db
      .collection("salesPortalLeads")
      .where("organizationId", "==", org.id)
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get();
  } catch {
    snap = await db.collection("salesPortalLeads").where("organizationId", "==", org.id).limit(limitCount).get();
  }

  let leads = snap.docs.map((doc) => serializeLead(doc.id, doc.data() || {}));

  if (opts?.status && opts.status !== "all") {
    leads = leads.filter((l) => l.status === opts.status);
  }
  if (opts?.assignedRepEmail) {
    const email = opts.assignedRepEmail.toLowerCase();
    leads = leads.filter((l) => (l.assignedRepEmail || "").toLowerCase() === email);
  }
  if (opts?.fromIso) {
    leads = leads.filter((l) => !!l.createdAt && l.createdAt >= opts.fromIso!);
  }
  if (opts?.toIso) {
    leads = leads.filter((l) => !!l.createdAt && l.createdAt <= opts.toIso!);
  }
  if (opts?.search) {
    const q = opts.search.trim().toLowerCase();
    if (q) {
      leads = leads.filter((l) => `${l.company} ${l.contactName}`.toLowerCase().includes(q));
    }
  }

  return leads.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function updateLead(
  id: string,
  updates: Partial<
    Pick<Lead, "company" | "contactName" | "email" | "phone" | "industry" | "estAnnualSpend" | "notes">
  >,
): Promise<Lead> {
  const ref = getDb().collection("salesPortalLeads").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Lead not found.");

  const payload: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.company !== undefined) payload.company = takeText(updates.company);
  if (updates.contactName !== undefined) payload.contactName = takeText(updates.contactName);
  if (updates.email !== undefined) payload.email = takeText(updates.email);
  if (updates.phone !== undefined) payload.phone = takeText(updates.phone);
  if (updates.industry !== undefined) payload.industry = takeText(updates.industry);
  if (updates.estAnnualSpend !== undefined) payload.estAnnualSpend = updates.estAnnualSpend;
  if (updates.notes !== undefined) payload.notes = takeText(updates.notes);

  await ref.update(payload);
  const fresh = await ref.get();
  return serializeLead(fresh.id, fresh.data() || {});
}

export async function setLeadStatus(
  id: string,
  status: LeadStatus,
  staff: { email: string; name: string },
): Promise<Lead> {
  if (!LEAD_STATUSES.includes(status)) throw new Error("Invalid status.");
  const ref = getDb().collection("salesPortalLeads").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Lead not found.");
  const prevStatus = takeText(snap.data()?.status) || "new";

  await ref.update({ status, updatedAt: new Date() });
  if (prevStatus !== status) {
    await logActivity({
      leadId: id,
      type: "status_change",
      text: `Status changed from ${prevStatus} to ${status}.`,
      staffEmail: staff.email,
      staffName: staff.name,
    });
  }
  const fresh = await ref.get();
  return serializeLead(fresh.id, fresh.data() || {});
}

export async function assignLead(
  id: string,
  rep: { email: string; name: string } | null,
  staff: { email: string; name: string },
): Promise<Lead> {
  const ref = getDb().collection("salesPortalLeads").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Lead not found.");

  await ref.update({
    assignedRepEmail: rep?.email || null,
    assignedRepName: rep?.name || null,
    routingReason: rep ? "Manually assigned" : null,
    updatedAt: new Date(),
  });
  await logActivity({
    leadId: id,
    type: "note",
    text: rep ? `Assigned to ${rep.name}.` : "Unassigned.",
    staffEmail: staff.email,
    staffName: staff.name,
  });
  const fresh = await ref.get();
  return serializeLead(fresh.id, fresh.data() || {});
}

export async function addLeadActivity(opts: {
  leadId: string;
  type: LeadActivityType;
  text: string;
  staffEmail: string;
  staffName: string;
}): Promise<LeadActivity> {
  const text = takeText(opts.text);
  if (!text) throw new Error("Activity text is required.");
  const org = await getLuxesupplyOrg();
  const ref = getDb().collection("salesPortalLeadActivities").doc();
  const now = new Date();
  await ref.set({
    orgSlug: WHOLESALE_ORG_SLUG,
    organizationId: org.id,
    leadId: opts.leadId,
    type: opts.type,
    text,
    staffEmail: opts.staffEmail,
    staffName: opts.staffName,
    createdAt: now,
  });
  // Touch the lead so "last activity" sorting/updatedAt stays meaningful.
  await getDb().collection("salesPortalLeads").doc(opts.leadId).update({ updatedAt: now }).catch(() => {});
  return serializeActivity(ref.id, { leadId: opts.leadId, type: opts.type, text, staffEmail: opts.staffEmail, staffName: opts.staffName, createdAt: now });
}

export async function listLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const db = getDb();
  let snap;
  try {
    snap = await db
      .collection("salesPortalLeadActivities")
      .where("leadId", "==", leadId)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();
  } catch {
    snap = await db.collection("salesPortalLeadActivities").where("leadId", "==", leadId).limit(200).get();
  }
  return snap.docs
    .map((doc) => serializeActivity(doc.id, doc.data() || {}))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function markLeadConverted(
  id: string,
  buyer: { id: string; username: string },
  staff: { email: string; name: string },
): Promise<Lead> {
  const ref = getDb().collection("salesPortalLeads").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Lead not found.");

  await ref.update({
    status: "won" as LeadStatus,
    convertedBuyerId: buyer.id,
    convertedBuyerUsername: buyer.username,
    updatedAt: new Date(),
  });
  await logActivity({
    leadId: id,
    type: "converted",
    text: `Converted to client account @${buyer.username}.`,
    staffEmail: staff.email,
    staffName: staff.name,
  });
  const fresh = await ref.get();
  return serializeLead(fresh.id, fresh.data() || {});
}
