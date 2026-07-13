import { createHash, scryptSync, timingSafeEqual } from "crypto";
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

function holdDocId(orgSlug: string, sku: string): string {
  const raw = `${orgSlug}__${sku}`.toLowerCase();
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

const HOLD_CART_MS = 30 * 60 * 1000;

export async function syncCartHolds(opts: {
  buyerId: string;
  username: string;
  displayName: string;
  skus: string[];
}): Promise<void> {
  const org = await getLuxesupplyOrg();
  const db = getDb();
  const heldUntil = new Date(Date.now() + HOLD_CART_MS);
  const unique = [...new Set(opts.skus.filter(Boolean))];

  // Write holds for current cart SKUs
  const batch = db.batch();
  for (const sku of unique) {
    const ref = db.collection("salesPortalHolds").doc(holdDocId(WHOLESALE_ORG_SLUG, sku));
    batch.set(
      ref,
      {
        orgSlug: WHOLESALE_ORG_SLUG,
        organizationId: org.id,
        uploadDirectory: WHOLESALE_ORG_SLUG,
        sku,
        portalUsername: opts.username,
        buyerDisplayName: opts.displayName || opts.username,
        reason: "cart",
        heldUntil,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  }
  await batch.commit();
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
