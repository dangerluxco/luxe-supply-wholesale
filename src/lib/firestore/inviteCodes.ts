import { randomBytes } from "crypto";
import { getDb, toIso, WHOLESALE_ORG_SLUG } from "./admin";
import { getLuxesupplyOrg } from "./staff";

export type InviteCode = {
  id: string;
  code: string;
  label: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdBy: string;
  createdAt: string | null;
};

function normalizeCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
}

function serialize(id: string, d: Record<string, unknown>): InviteCode {
  return {
    id,
    code: String(d.code || ""),
    label: String(d.label || ""),
    maxUses: Number(d.maxUses) > 0 ? Math.floor(Number(d.maxUses)) : 1,
    usedCount: Math.max(0, Math.floor(Number(d.usedCount) || 0)),
    expiresAt: toIso(d.expiresAt),
    revokedAt: toIso(d.revokedAt),
    createdBy: String(d.createdBy || ""),
    createdAt: toIso(d.createdAt),
  };
}

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) out += alphabet[bytes[i]! % alphabet.length];
  return `LUXE-${out}`;
}

export async function listInviteCodes(): Promise<InviteCode[]> {
  const org = await getLuxesupplyOrg();
  const snap = await getDb()
    .collection("salesPortalInviteCodes")
    .where("organizationId", "==", org.id)
    .limit(200)
    .get()
    .catch(() =>
      getDb().collection("salesPortalInviteCodes").where("orgSlug", "==", WHOLESALE_ORG_SLUG).limit(200).get(),
    );
  const rows = snap.docs.map((d) => serialize(d.id, d.data() || {}));
  rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return rows;
}

export async function createInviteCode(input: {
  label?: string;
  maxUses?: number;
  expiresAt?: string | null;
  createdBy: string;
  code?: string;
}): Promise<InviteCode> {
  const org = await getLuxesupplyOrg();
  const code = normalizeCode(input.code || "") || generateCode();
  const maxUses = input.maxUses && input.maxUses > 0 ? Math.floor(input.maxUses) : 1;
  const ref = getDb().collection("salesPortalInviteCodes").doc();
  const payload = {
    orgSlug: WHOLESALE_ORG_SLUG,
    organizationId: org.id,
    code,
    label: String(input.label || "").trim().slice(0, 120),
    maxUses,
    usedCount: 0,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    revokedAt: null,
    createdBy: input.createdBy,
    createdAt: new Date(),
  };
  await ref.set(payload);
  return serialize(ref.id, payload);
}

export async function revokeInviteCode(id: string): Promise<void> {
  const ref = getDb().collection("salesPortalInviteCodes").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Invite code not found.");
  await ref.update({ revokedAt: new Date() });
}

export type InviteCodeCheck =
  | { ok: true; code: InviteCode }
  | { ok: false; reason: string };

export async function validateInviteCode(raw: string): Promise<InviteCodeCheck> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, reason: "Invite code is required." };

  const org = await getLuxesupplyOrg();
  let snap = await getDb()
    .collection("salesPortalInviteCodes")
    .where("organizationId", "==", org.id)
    .where("code", "==", code)
    .limit(1)
    .get();
  if (snap.empty) {
    snap = await getDb()
      .collection("salesPortalInviteCodes")
      .where("orgSlug", "==", WHOLESALE_ORG_SLUG)
      .where("code", "==", code)
      .limit(1)
      .get();
  }
  if (snap.empty) return { ok: false, reason: "Invalid invite code." };

  const doc = snap.docs[0]!;
  const row = serialize(doc.id, doc.data() || {});
  if (row.revokedAt) return { ok: false, reason: "This invite code has been revoked." };
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: "This invite code has expired." };
  }
  if (row.usedCount >= row.maxUses) {
    return { ok: false, reason: "This invite code has already been used." };
  }
  return { ok: true, code: row };
}

/** Atomically consume one use after a successful registration submit. */
export async function consumeInviteCode(id: string): Promise<void> {
  const ref = getDb().collection("salesPortalInviteCodes").doc(id);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Invite code not found.");
    const d = snap.data() || {};
    const maxUses = Number(d.maxUses) > 0 ? Math.floor(Number(d.maxUses)) : 1;
    const usedCount = Math.max(0, Math.floor(Number(d.usedCount) || 0));
    if (d.revokedAt) throw new Error("Invite code revoked.");
    if (d.expiresAt && new Date(d.expiresAt).getTime() < Date.now()) {
      throw new Error("Invite code expired.");
    }
    if (usedCount >= maxUses) throw new Error("Invite code exhausted.");
    tx.update(ref, { usedCount: usedCount + 1 });
  });
}
