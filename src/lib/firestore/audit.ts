import { getDb, toIso, WHOLESALE_ORG_SLUG } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import type { SessionUser } from "@/lib/auth-session";

export type AuditEvent = {
  id: string;
  organizationId: string;
  actorStaffId: string;
  actorEmail: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string | null;
};

export async function logAudit(input: {
  actor: Pick<SessionUser, "id" | "email" | "name">;
  action: string;
  entity: string;
  entityId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const org = await getLuxesupplyOrg();
    await getDb().collection("salesPortalAuditEvents").add({
      orgSlug: WHOLESALE_ORG_SLUG,
      organizationId: org.id,
      actorStaffId: input.actor.id,
      actorEmail: input.actor.email,
      actorName: input.actor.name,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId || "",
      payload: input.payload || {},
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn("[audit] write failed:", err instanceof Error ? err.message : err);
  }
}

export async function listAuditEvents(limit = 300): Promise<AuditEvent[]> {
  const org = await getLuxesupplyOrg();
  const snap = await getDb()
    .collection("salesPortalAuditEvents")
    .where("organizationId", "==", org.id)
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(limit, 1), 500))
    .get()
    .catch(async () => {
      // Fallback if composite index missing — scan recent by orgSlug.
      return getDb()
        .collection("salesPortalAuditEvents")
        .where("orgSlug", "==", WHOLESALE_ORG_SLUG)
        .limit(Math.min(Math.max(limit, 1), 500))
        .get();
    });

  const rows = snap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      id: doc.id,
      organizationId: String(d.organizationId || ""),
      actorStaffId: String(d.actorStaffId || ""),
      actorEmail: String(d.actorEmail || ""),
      actorName: String(d.actorName || ""),
      action: String(d.action || ""),
      entity: String(d.entity || ""),
      entityId: String(d.entityId || ""),
      payload: (d.payload && typeof d.payload === "object" ? d.payload : {}) as Record<string, unknown>,
      createdAt: toIso(d.createdAt),
    };
  });
  rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return rows.slice(0, limit);
}
