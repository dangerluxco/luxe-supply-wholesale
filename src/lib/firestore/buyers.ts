import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb, toIso, WHOLESALE_ORG_SLUG } from "./admin";
import { getLuxesupplyOrg } from "./staff";

export type PortalBuyer = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  company: string;
  ein: string;
  phone: string;
  status: string;
  createdAt: string | null;
  lastLoginAt: string | null;
};

function serializeBuyer(id: string, d: Record<string, unknown>): PortalBuyer {
  return {
    id,
    username: String(d.username || ""),
    displayName: String(d.displayName || d.username || ""),
    email: String(d.email || ""),
    company: String(d.company || ""),
    ein: String(d.ein || ""),
    phone: String(d.phone || ""),
    status: String(d.status || "invited"),
    createdAt: toIso(d.createdAt),
    lastLoginAt: toIso(d.lastLoginAt),
  };
}

export function normalizeBuyerUsername(raw: string): string | null {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s || s.length > 80 || !/^[a-z0-9._-]+$/.test(s)) return null;
  return s;
}

function normalizeBuyerEmail(raw: string): string | null {
  const e = String(raw || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** Derive a login username from an email local-part, stripping +alias tags. */
function usernameFromEmail(email: string): string | null {
  const local = String(email || "").trim().toLowerCase().split("@")[0] || "";
  const withoutAlias = local.split("+")[0] || "";
  const cleaned = withoutAlias
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, 80);
  return normalizeBuyerUsername(cleaned);
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

export async function getBuyerById(id: string): Promise<PortalBuyer | null> {
  if (!id) return null;
  const snap = await getDb().collection("salesPortalBuyers").doc(id).get();
  if (!snap.exists) return null;
  return serializeBuyer(snap.id, snap.data() || {});
}

export async function authenticateBuyer(
  usernameRaw: string,
  password: string,
): Promise<{ ok: true; buyer: PortalBuyer } | { ok: false; reason?: string }> {
  const username = normalizeBuyerUsername(usernameRaw);
  if (!username || !password) return { ok: false };

  const org = await getLuxesupplyOrg();
  const db = getDb();
  let snap;
  try {
    snap = await db
      .collection("salesPortalBuyers")
      .where("organizationId", "==", org.id)
      .where("username", "==", username)
      .limit(1)
      .get();
  } catch {
    snap = await db.collection("salesPortalBuyers").where("username", "==", username).limit(5).get();
  }

  let match: QueryDocumentSnapshot | null = null;
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    if (d.organizationId === org.id || d.orgSlug === WHOLESALE_ORG_SLUG || !d.orgSlug) {
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
    await match.ref.update({
      lastLoginAt: new Date(),
      status: d.status === "invited" ? "active" : d.status || "active",
    });
  } catch {
    /* ignore */
  }

  return { ok: true, buyer: serializeBuyer(match.id, d) };
}

export async function listBuyers(): Promise<PortalBuyer[]> {
  const org = await getLuxesupplyOrg();
  const db = getDb();
  let snap;
  try {
    snap = await db
      .collection("salesPortalBuyers")
      .where("organizationId", "==", org.id)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
  } catch {
    snap = await db
      .collection("salesPortalBuyers")
      .where("organizationId", "==", org.id)
      .limit(100)
      .get();
  }

  return snap.docs
    .map((doc) => serializeBuyer(doc.id, doc.data() || {}))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

/** Staff-side invite: creates a storefront login in the same buyers collection auth reads from. */
export async function createBuyer(opts: {
  email: string;
  username?: string;
  password?: string;
  displayName?: string;
  company?: string;
  ein?: string;
  phone?: string;
  createdBy: string;
}): Promise<{ buyer: PortalBuyer; temporaryPassword: string }> {
  const email = normalizeBuyerEmail(opts.email);
  if (!email) throw new Error("A valid email is required.");

  const username = normalizeBuyerUsername(opts.username || "") || usernameFromEmail(email);
  if (!username) {
    throw new Error(
      "Could not derive a username from that email. Enter a username (letters, numbers, . _ - only).",
    );
  }

  const org = await getLuxesupplyOrg();
  const db = getDb();

  const existing = await db
    .collection("salesPortalBuyers")
    .where("organizationId", "==", org.id)
    .where("username", "==", username)
    .limit(1)
    .get();
  if (!existing.empty) throw new Error(`Buyer username "${username}" already exists.`);

  const password = String(opts.password || "").trim() || generateTempPassword();
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  const { salt, hash } = hashPortalPassword(password);

  const now = new Date();
  const ref = db.collection("salesPortalBuyers").doc();
  await ref.set({
    organizationId: org.id,
    orgSlug: WHOLESALE_ORG_SLUG,
    username,
    displayName: String(opts.displayName || "").trim().slice(0, 120) || username,
    email,
    company: String(opts.company || "").trim().slice(0, 160),
    ein: String(opts.ein || "").trim().slice(0, 40),
    phone: String(opts.phone || "").trim().slice(0, 40),
    passwordSalt: salt,
    passwordHash: hash,
    mustChangePassword: true,
    status: "invited",
    invitedAt: now,
    invitedBy: opts.createdBy,
    createdAt: now,
    updatedAt: now,
    createdBy: opts.createdBy,
    emailSent: false,
  });

  const saved = await ref.get();
  return {
    buyer: serializeBuyer(saved.id, saved.data() || {}),
    temporaryPassword: password,
  };
}

export type CartLotItem = {
  sku: string;
  title?: string;
  brand?: string;
  quantity?: number;
  imageUrl?: string | null;
};

export type CartItem = {
  sku: string;
  title: string;
  brand: string;
  price: number;
  imageUrl: string | null;
  addedAt: string;
  /** Curated suggested lot (Firestore salesPortalSuggestedLots). */
  isSuggestedLot?: boolean;
  lotId?: string;
  lotItems?: CartLotItem[];
};

/** Expand cart lines to inventory SKUs for soft holds. */
export function cartHoldSkus(items: CartItem[]): string[] {
  const skus: string[] = [];
  for (const line of items) {
    if (line.isSuggestedLot && Array.isArray(line.lotItems)) {
      for (const li of line.lotItems) {
        if (li?.sku) skus.push(li.sku);
      }
    } else if (line.sku && !String(line.sku).startsWith("lot:")) {
      skus.push(line.sku);
    }
  }
  return [...new Set(skus.filter(Boolean))];
}

export async function getBuyerCart(buyerId: string): Promise<CartItem[]> {
  const snap = await getDb().collection("salesPortalCarts").doc(buyerId).get();
  if (!snap.exists) return [];
  const items = (snap.data() || {}).items;
  return Array.isArray(items) ? (items as CartItem[]) : [];
}

export async function setBuyerCart(buyerId: string, items: CartItem[]): Promise<void> {
  await getDb()
    .collection("salesPortalCarts")
    .doc(buyerId)
    .set({ items, updatedAt: new Date() }, { merge: true });
}

export async function createBuyerQuote(opts: {
  buyer: PortalBuyer;
  items: CartItem[];
  message?: string;
}): Promise<{ id: string }> {
  const org = await getLuxesupplyOrg();
  const cartTotal = opts.items.reduce((s, i) => s + (Number(i.price) || 0), 0);
  const ref = getDb().collection("salesPortalQuotes").doc();
  await ref.set({
    orgSlug: WHOLESALE_ORG_SLUG,
    orgName: String(org.data.displayName || org.data.name || WHOLESALE_ORG_SLUG),
    organizationId: org.id,
    status: "open",
    portalUsername: opts.buyer.username,
    buyerDisplayName: opts.buyer.displayName,
    customerName: opts.buyer.displayName || opts.buyer.username,
    customerEmail: opts.buyer.email || "",
    customerCompany: opts.buyer.company || "",
    customerPhone: opts.buyer.phone || "",
    message: String(opts.message || "").slice(0, 2000),
    items: opts.items.map((i) => ({
      sku: i.sku,
      title: i.title,
      brand: i.brand,
      quantity: 1,
      price: i.price,
      isSuggestedLot: !!i.isSuggestedLot,
      lotId: i.isSuggestedLot ? i.lotId || "" : "",
      lotItems: i.isSuggestedLot && Array.isArray(i.lotItems) ? i.lotItems : [],
    })),
    itemCount: opts.items.length,
    cartTotal,
    adminNotes: "",
    emailSent: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id: ref.id };
}
