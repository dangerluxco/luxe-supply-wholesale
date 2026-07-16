import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb, toIso, WHOLESALE_ORG_SLUG } from "./admin";
import { ROLE, type Role } from "@/lib/constants";

const STAFF_STATUSES = new Set(["active", "disabled"]);

export type StaffRecord = {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  role: "admin" | "staff";
  status: string;
  organizationId: string | null;
};

export type StaffListItem = StaffRecord & {
  lastLoginAt: string | null;
  createdAt: string | null;
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

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i += 1) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

function hashPortalPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password || ""), salt, 64).toString("hex");
  return { salt, hash };
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

export async function listStaff(): Promise<StaffListItem[]> {
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

  return snap.docs
    .map((doc) => {
      const d = doc.data() || {};
      return {
        ...serializeStaff(doc.id, d),
        lastLoginAt: toIso(d.lastLoginAt),
        createdAt: toIso(d.createdAt),
      };
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function countActiveAdmins(): Promise<number> {
  const staff = await listStaff();
  return staff.filter((s) => s.status !== "disabled" && s.isAdmin).length;
}

/** Admin invite: creates a staff login in the same collection auth reads from. */
export async function createStaff(opts: {
  email: string;
  displayName?: string;
  password?: string;
  isAdmin?: boolean;
  invitedBy: string;
}): Promise<{ staff: StaffRecord; temporaryPassword: string }> {
  const email = normalizeStaffEmail(opts.email);
  if (!email) throw new Error("A valid email is required.");

  const existing = await findStaffByEmail(email);
  if (existing) throw new Error("A staff user with that email already exists.");

  const password = String(opts.password || "").trim() || generateTempPassword();
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const isAdmin = opts.isAdmin === true;
  const { salt, hash } = hashPortalPassword(password);
  const org = await getLuxesupplyOrg();
  const now = new Date();
  const displayName =
    String(opts.displayName || "")
      .trim()
      .slice(0, 120) || email;

  const ref = getDb().collection("salesPortalStaff").doc();
  await ref.set({
    organizationId: org.id,
    orgSlug: WHOLESALE_ORG_SLUG,
    email,
    username: email,
    displayName,
    isAdmin,
    role: isAdmin ? "admin" : "staff",
    status: "active",
    passwordSalt: salt,
    passwordHash: hash,
    mustChangePassword: true,
    invitedBy: opts.invitedBy,
    createdBy: opts.invitedBy,
    createdAt: now,
    updatedAt: now,
    emailSent: false,
  });

  const saved = await ref.get();
  return {
    staff: serializeStaff(saved.id, saved.data() || {}),
    temporaryPassword: password,
  };
}

/** Admin: toggle isAdmin / status / displayName. Blocks removing the last active admin. */
export async function updateStaff(
  targetStaffId: string,
  updates: {
    displayName?: string;
    isAdmin?: boolean;
    status?: string;
    updatedBy: string;
  },
): Promise<StaffRecord> {
  const id = String(targetStaffId || "").trim();
  if (!id) throw new Error("Staff id is required.");

  const ref = getDb().collection("salesPortalStaff").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Staff user not found.");

  const prev = snap.data() || {};
  if (prev.orgSlug && prev.orgSlug !== WHOLESALE_ORG_SLUG) {
    throw new Error("Not allowed.");
  }

  const payload: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: updates.updatedBy,
  };

  if (updates.displayName !== undefined) {
    payload.displayName =
      String(updates.displayName || "")
        .trim()
        .slice(0, 120) ||
      String(prev.email || "") ||
      "";
  }

  let nextIsAdmin = staffIsAdmin(prev);
  if (updates.isAdmin !== undefined) {
    nextIsAdmin = updates.isAdmin === true;
    payload.isAdmin = nextIsAdmin;
    payload.role = nextIsAdmin ? "admin" : "staff";
  }

  let nextStatus = String(prev.status || "active");
  if (updates.status !== undefined) {
    nextStatus = String(updates.status || "").toLowerCase();
    if (!STAFF_STATUSES.has(nextStatus)) throw new Error("Invalid status.");
    payload.status = nextStatus;
  }

  const wasActiveAdmin = (prev.status || "active") === "active" && staffIsAdmin(prev);
  const willBeActiveAdmin = nextStatus === "active" && nextIsAdmin;
  if (wasActiveAdmin && !willBeActiveAdmin) {
    const adminCount = await countActiveAdmins();
    if (adminCount <= 1) {
      throw new Error("Cannot remove or disable the last active admin.");
    }
  }

  await ref.update(payload);
  const saved = await ref.get();
  return serializeStaff(saved.id, saved.data() || {});
}

/** Admin: reset password (scrypt salt/hash, mustChangePassword). Returns temp password. */
export async function resetStaffPassword(
  targetStaffId: string,
  opts: { password?: string; updatedBy: string },
): Promise<{ staff: StaffRecord; temporaryPassword: string }> {
  const id = String(targetStaffId || "").trim();
  if (!id) throw new Error("Staff id is required.");

  const ref = getDb().collection("salesPortalStaff").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Staff user not found.");

  const prev = snap.data() || {};
  if (prev.orgSlug && prev.orgSlug !== WHOLESALE_ORG_SLUG) {
    throw new Error("Not allowed.");
  }

  const password = String(opts.password || "").trim() || generateTempPassword();
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const { salt, hash } = hashPortalPassword(password);
  await ref.update({
    passwordSalt: salt,
    passwordHash: hash,
    mustChangePassword: true,
    updatedAt: new Date(),
    updatedBy: opts.updatedBy,
  });

  const saved = await ref.get();
  return {
    staff: serializeStaff(saved.id, saved.data() || {}),
    temporaryPassword: password,
  };
}

export async function markStaffEmailSent(staffId: string): Promise<void> {
  const id = String(staffId || "").trim();
  if (!id) return;
  try {
    await getDb().collection("salesPortalStaff").doc(id).update({
      emailSent: true,
      emailSentAt: new Date(),
    });
  } catch {
    /* ignore */
  }
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
