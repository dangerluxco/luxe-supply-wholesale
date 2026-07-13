import { scryptSync, timingSafeEqual } from "crypto";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb, toIso, WHOLESALE_ORG_SLUG } from "./admin";
import { ROLE, type Role } from "@/lib/constants";

export type StaffRecord = {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  role: "admin" | "staff";
  status: string;
  organizationId: string | null;
};

function normalizeStaffEmail(raw: string): string | null {
  const e = String(raw || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function staffIsAdmin(data: Record<string, unknown>): boolean {
  if (data.isAdmin === true) return true;
  if (data.isAdmin === false) return false;
  return String(data.role || "").toLowerCase() === "admin";
}

function verifyPortalPassword(password: string, salt: unknown, expectedHash: unknown): boolean {
  if (!salt || !expectedHash) return false;
  try {
    const actual = scryptSync(String(password || ""), String(salt), 64).toString("hex");
    const a = Buffer.from(actual, "hex");
    const b = Buffer.from(String(expectedHash), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function serializeStaff(id: string, d: Record<string, unknown>): StaffRecord {
  const isAdmin = staffIsAdmin(d);
  return {
    id,
    email: String(d.email || ""),
    displayName: String(d.displayName || d.email || ""),
    isAdmin,
    role: isAdmin ? "admin" : "staff",
    status: String(d.status || "active"),
    organizationId: d.organizationId ? String(d.organizationId) : null,
  };
}

export async function findStaffByEmail(emailRaw: string): Promise<StaffRecord | null> {
  const email = normalizeStaffEmail(emailRaw);
  if (!email) return null;
  const db = getDb();

  let snap = await db
    .collection("salesPortalStaff")
    .where("orgSlug", "==", WHOLESALE_ORG_SLUG)
    .where("email", "==", email)
    .limit(5)
    .get();

  if (snap.empty) {
    snap = await db.collection("salesPortalStaff").where("email", "==", email).limit(5).get();
  }

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    if (d.orgSlug === WHOLESALE_ORG_SLUG || !d.orgSlug) {
      return serializeStaff(doc.id, d);
    }
  }
  return null;
}

export async function getStaffById(id: string): Promise<StaffRecord | null> {
  if (!id) return null;
  const snap = await getDb().collection("salesPortalStaff").doc(id).get();
  if (!snap.exists) return null;
  return serializeStaff(snap.id, snap.data() || {});
}

export async function authenticateStaff(
  emailRaw: string,
  password: string,
): Promise<{ ok: true; staff: StaffRecord } | { ok: false; reason?: string }> {
  const email = normalizeStaffEmail(emailRaw);
  if (!email || !password) return { ok: false };

  const db = getDb();
  let snap = await db
    .collection("salesPortalStaff")
    .where("orgSlug", "==", WHOLESALE_ORG_SLUG)
    .where("email", "==", email)
    .limit(5)
    .get();
  if (snap.empty) {
    snap = await db.collection("salesPortalStaff").where("email", "==", email).limit(5).get();
  }

  let match: QueryDocumentSnapshot | null = null;
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    if (d.orgSlug === WHOLESALE_ORG_SLUG || !d.orgSlug) {
      match = doc;
      break;
    }
  }
  if (!match) return { ok: false };

  const d = match.data() || {};
  if (d.status === "disabled") return { ok: false, reason: "disabled" };
  if (!verifyPortalPassword(password, d.passwordSalt, d.passwordHash)) {
    return { ok: false };
  }

  try {
    await match.ref.update({ lastLoginAt: new Date() });
  } catch {
    /* ignore */
  }

  return { ok: true, staff: serializeStaff(match.id, d) };
}

export function staffToAppRole(staff: StaffRecord): Role {
  return staff.isAdmin ? ROLE.MANAGER : ROLE.REP;
}

export function initialsFromName(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "LS";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] || ""}${parts[1]![0] || ""}`.toUpperCase();
}

export async function listStaff(): Promise<
  Array<StaffRecord & { lastLoginAt: string | null; createdAt: string | null }>
> {
  const db = getDb();
  let snap;
  try {
    snap = await db
      .collection("salesPortalStaff")
      .where("orgSlug", "==", WHOLESALE_ORG_SLUG)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
  } catch {
    snap = await db
      .collection("salesPortalStaff")
      .where("orgSlug", "==", WHOLESALE_ORG_SLUG)
      .limit(100)
      .get();
  }

  return snap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      ...serializeStaff(doc.id, d),
      lastLoginAt: toIso(d.lastLoginAt),
      createdAt: toIso(d.createdAt),
    };
  });
}

/** Active staff emails for this portal — used to notify staff of new invoice requests. */
export async function listActiveStaffEmails(): Promise<string[]> {
  const staff = await listStaff();
  return [
    ...new Set(
      staff
        .filter((s) => s.status !== "disabled" && s.email)
        .map((s) => s.email.trim().toLowerCase()),
    ),
  ];
}

export async function getLuxesupplyOrg(): Promise<{
  id: string;
  data: Record<string, unknown>;
}> {
  const snap = await getDb()
    .collection("organizations")
    .where("uploadDirectory", "==", WHOLESALE_ORG_SLUG)
    .limit(1)
    .get();
  if (snap.empty) throw new Error("LuxeSupply organization not found");
  const doc = snap.docs[0]!;
  return { id: doc.id, data: (doc.data() || {}) as Record<string, unknown> };
}
