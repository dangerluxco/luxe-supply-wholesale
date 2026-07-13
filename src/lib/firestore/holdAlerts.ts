// Buyer-facing "notify me" wishlist for pieces currently soft-held by another buyer.
// Mirrors the legacy Cloud Functions `salesPortalHoldAlerts` collection shape
// (functions/salesPortal.js addSalesPortalHoldAlert / listSalesPortalWishlistRequests) —
// kept minimal for the Next portal: no scheduled notify job here yet, staff can see
// demand on /wholesaleportal/rep/wishlist and follow up manually.
import { createHash } from "crypto";
import { getDb, toIso, WHOLESALE_ORG_SLUG } from "./admin";
import { getLuxesupplyOrg } from "./staff";

export function holdAlertDocId(orgSlug: string, username: string, sku: string): string {
  const raw = `${orgSlug}__${username}__${sku}`.toLowerCase();
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

export type HoldAlertItem = {
  id: string;
  sku: string;
  title: string;
  brand: string;
  portalUsername: string;
  buyerDisplayName: string;
  buyerEmail: string;
  status: string;
  createdAt: string | null;
};

function serializeHoldAlert(id: string, d: Record<string, unknown>): HoldAlertItem {
  return {
    id,
    sku: String(d.sku || ""),
    title: String(d.title || d.sku || ""),
    brand: String(d.brand || ""),
    portalUsername: String(d.portalUsername || ""),
    buyerDisplayName: String(d.buyerDisplayName || d.portalUsername || ""),
    buyerEmail: String(d.buyerEmail || ""),
    status: String(d.status || "active"),
    createdAt: toIso(d.createdAt),
  };
}

export async function addHoldAlert(opts: {
  username: string;
  displayName?: string;
  email?: string;
  sku: string;
  title?: string;
  brand?: string;
}): Promise<void> {
  const username = String(opts.username || "").trim().toLowerCase();
  const sku = String(opts.sku || "").trim();
  if (!username || !sku) return;

  const org = await getLuxesupplyOrg();
  const ref = getDb()
    .collection("salesPortalHoldAlerts")
    .doc(holdAlertDocId(WHOLESALE_ORG_SLUG, username, sku));
  const now = new Date();
  await ref.set(
    {
      orgSlug: WHOLESALE_ORG_SLUG,
      organizationId: org.id,
      portalUsername: username,
      buyerDisplayName: opts.displayName || username,
      buyerEmail: opts.email || "",
      sku,
      title: opts.title || sku,
      brand: opts.brand || "",
      status: "active",
      updatedAt: now,
      createdAt: now,
    },
    { merge: true },
  );
}

export async function removeHoldAlert(username: string, sku: string): Promise<void> {
  const u = String(username || "").trim().toLowerCase();
  const s = String(sku || "").trim();
  if (!u || !s) return;
  await getDb()
    .collection("salesPortalHoldAlerts")
    .doc(holdAlertDocId(WHOLESALE_ORG_SLUG, u, s))
    .delete();
}

export async function getHoldAlertForBuyerSku(username: string, sku: string): Promise<boolean> {
  const u = String(username || "").trim().toLowerCase();
  const s = String(sku || "").trim();
  if (!u || !s) return false;
  const snap = await getDb()
    .collection("salesPortalHoldAlerts")
    .doc(holdAlertDocId(WHOLESALE_ORG_SLUG, u, s))
    .get();
  return snap.exists && String(snap.data()?.status || "") === "active";
}

export async function listHoldAlertsForBuyer(username: string): Promise<HoldAlertItem[]> {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return [];
  const db = getDb();
  let snap;
  try {
    snap = await db
      .collection("salesPortalHoldAlerts")
      .where("orgSlug", "==", WHOLESALE_ORG_SLUG)
      .where("portalUsername", "==", u)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
  } catch {
    snap = await db
      .collection("salesPortalHoldAlerts")
      .where("orgSlug", "==", WHOLESALE_ORG_SLUG)
      .where("portalUsername", "==", u)
      .limit(100)
      .get();
  }
  return snap.docs
    .map((doc) => serializeHoldAlert(doc.id, doc.data() || {}))
    .filter((it) => it.status === "active")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function listHoldAlertsForStaff(limitCount = 200): Promise<HoldAlertItem[]> {
  const org = await getLuxesupplyOrg();
  const db = getDb();
  let snap;
  try {
    snap = await db
      .collection("salesPortalHoldAlerts")
      .where("organizationId", "==", org.id)
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get();
  } catch {
    snap = await db
      .collection("salesPortalHoldAlerts")
      .where("organizationId", "==", org.id)
      .limit(limitCount)
      .get();
  }
  return snap.docs
    .map((doc) => serializeHoldAlert(doc.id, doc.data() || {}))
    .filter((it) => it.status === "active")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}
