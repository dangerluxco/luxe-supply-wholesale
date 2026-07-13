import { createHash } from "crypto";
import { getDb, toIso, WHOLESALE_ORG_SLUG } from "./admin";
import { getLuxesupplyOrg } from "./staff";

export const HOLD_CART_MS = 30 * 60 * 1000;
export const HOLD_QUOTE_MS = 48 * 60 * 60 * 1000;

export type PortalHold = {
  id: string;
  sku: string;
  portalUsername: string;
  buyerDisplayName: string;
  reason: string;
  quoteId: string | null;
  heldUntil: string | null;
};

export function holdDocId(orgSlug: string, sku: string): string {
  const raw = `${orgSlug}__${sku}`.toLowerCase();
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value !== null && "toMillis" in value) {
    return Number((value as { toMillis: () => number }).toMillis()) || 0;
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().getTime() || 0;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isHoldActive(hold: { heldUntil?: unknown } | null | undefined, nowMs = Date.now()): boolean {
  if (!hold) return false;
  return toMillis(hold.heldUntil) > nowMs;
}

export async function loadActiveHoldsBySku(skus: string[]): Promise<Map<string, PortalHold>> {
  const map = new Map<string, PortalHold>();
  const unique = [...new Set(skus.map((s) => String(s || "").trim()).filter(Boolean))];
  if (!unique.length) return map;

  const db = getDb();
  const nowMs = Date.now();
  const refs = unique.map((sku) =>
    db.collection("salesPortalHolds").doc(holdDocId(WHOLESALE_ORG_SLUG, sku)),
  );

  for (let i = 0; i < refs.length; i += 40) {
    const chunk = refs.slice(i, i + 40);
    const snaps = await db.getAll(...chunk);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const d = snap.data() || {};
      if (!isHoldActive(d, nowMs)) continue;
      const sku = String(d.sku || "").trim();
      if (!sku) continue;
      map.set(sku, {
        id: snap.id,
        sku,
        portalUsername: String(d.portalUsername || "").trim().toLowerCase(),
        buyerDisplayName: String(d.buyerDisplayName || d.portalUsername || ""),
        reason: String(d.reason || "cart"),
        quoteId: d.quoteId ? String(d.quoteId) : null,
        heldUntil: toIso(d.heldUntil),
      });
    }
  }
  return map;
}

/** Returns SKUs blocked because another buyer holds them. */
export async function findSkusHeldByOthers(
  skus: string[],
  buyerUsername: string,
): Promise<string[]> {
  const holds = await loadActiveHoldsBySku(skus);
  const me = String(buyerUsername || "").trim().toLowerCase();
  const blocked: string[] = [];
  for (const sku of skus) {
    const hold = holds.get(sku);
    if (!hold) continue;
    if (me && hold.portalUsername === me) continue;
    blocked.push(sku);
  }
  return blocked;
}

export async function upsertPortalHolds(opts: {
  skus: string[];
  portalUsername: string;
  buyerDisplayName?: string;
  reason?: "cart" | "quote";
  quoteId?: string | null;
  ttlMs?: number;
}): Promise<{ written: number }> {
  const username = String(opts.portalUsername || "").trim().toLowerCase();
  const unique = [...new Set((opts.skus || []).map((s) => String(s || "").trim()).filter(Boolean))];
  if (!unique.length || !username) return { written: 0 };

  const org = await getLuxesupplyOrg();
  const db = getDb();
  const heldUntil = new Date(Date.now() + (opts.ttlMs ?? HOLD_CART_MS));
  const now = new Date();
  let written = 0;

  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    const batch = db.batch();
    for (const sku of chunk) {
      const ref = db.collection("salesPortalHolds").doc(holdDocId(WHOLESALE_ORG_SLUG, sku));
      batch.set(
        ref,
        {
          orgSlug: WHOLESALE_ORG_SLUG,
          orgName: String(org.data.displayName || org.data.name || WHOLESALE_ORG_SLUG),
          organizationId: org.id,
          ownerUserId: null,
          uploadDirectory: WHOLESALE_ORG_SLUG,
          sku,
          portalUsername: username,
          buyerDisplayName: opts.buyerDisplayName || username,
          reason: opts.reason || "cart",
          quoteId: opts.quoteId || null,
          heldUntil,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true },
      );
      written += 1;
    }
    await batch.commit();
  }
  return { written };
}

/** Delete this buyer's cart holds that are not in keepSkus. */
export async function releaseBuyerCartHolds(
  portalUsername: string,
  keepSkus: string[],
): Promise<{ released: number; releasedSkus: string[] }> {
  const username = String(portalUsername || "").trim().toLowerCase();
  if (!username) return { released: 0, releasedSkus: [] };

  const keep = new Set(keepSkus.map((s) => String(s || "").toLowerCase()).filter(Boolean));
  const db = getDb();
  let snap;
  try {
    snap = await db
      .collection("salesPortalHolds")
      .where("orgSlug", "==", WHOLESALE_ORG_SLUG)
      .where("portalUsername", "==", username)
      .where("reason", "==", "cart")
      .limit(200)
      .get();
  } catch (err) {
    console.warn("[holds] releaseBuyerCartHolds query:", err instanceof Error ? err.message : err);
    return { released: 0, releasedSkus: [] };
  }

  if (snap.empty) return { released: 0, releasedSkus: [] };

  const batch = db.batch();
  let released = 0;
  const releasedSkus: string[] = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    const skuKey = String(d.sku || "").toLowerCase();
    if (keep.has(skuKey)) return;
    batch.delete(doc.ref);
    released += 1;
    if (d.sku) releasedSkus.push(String(d.sku));
  });
  if (released) await batch.commit();
  return { released, releasedSkus };
}

/**
 * Sync cart soft holds: release prior cart holds not in list, then upsert remaining.
 */
export async function syncCartHolds(opts: {
  username: string;
  displayName: string;
  skus: string[];
}): Promise<void> {
  const username = String(opts.username || "").trim().toLowerCase();
  if (!username) return;
  const unique = [...new Set(opts.skus.filter(Boolean))];

  await releaseBuyerCartHolds(username, unique);
  if (unique.length) {
    await upsertPortalHolds({
      skus: unique,
      portalUsername: username,
      buyerDisplayName: opts.displayName || username,
      reason: "cart",
      quoteId: null,
      ttlMs: HOLD_CART_MS,
    });
  }
}

/** After invoice-request submit: upgrade cart SKUs to 48h processing holds (stored with reason: "quote" — see BRIDGE.md). */
export async function convertCartHoldsToQuote(opts: {
  username: string;
  displayName: string;
  skus: string[];
  quoteId: string;
}): Promise<void> {
  const username = String(opts.username || "").trim().toLowerCase();
  const unique = [...new Set(opts.skus.filter(Boolean))];
  if (!username || !unique.length || !opts.quoteId) return;

  // Clear remaining cart-reason holds for this buyer, then write quote holds.
  await releaseBuyerCartHolds(username, []);
  await upsertPortalHolds({
    skus: unique,
    portalUsername: username,
    buyerDisplayName: opts.displayName || username,
    reason: "quote",
    quoteId: opts.quoteId,
    ttlMs: HOLD_QUOTE_MS,
  });
}
