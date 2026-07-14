import { getDb, toIso, WHOLESALE_ORG_SLUG, UPLOAD_DIRECTORY } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import { normalizeBuyerUsername } from "./buyers";

export type SuggestedLotItem = {
  sku: string;
  quantity: number;
  title: string;
  brand: string;
  imageUrl: string | null;
  imageUrls: string[];
};

export type SuggestedLot = {
  id: string;
  orgSlug: string;
  organizationId: string | null;
  buyerUsername: string;
  buyerDisplayName: string;
  title: string;
  note: string;
  status: string;
  lotPrice: number | null;
  items: SuggestedLotItem[];
  itemCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy?: string;
};

function parseLotPrice(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function serializeLot(id: string, d: Record<string, unknown>): SuggestedLot {
  const itemsRaw = Array.isArray(d.items) ? d.items : [];
  const items: SuggestedLotItem[] = itemsRaw.map((it) => {
    const row = (it || {}) as Record<string, unknown>;
    const fromArray = Array.isArray(row.imageUrls)
      ? row.imageUrls.map(String).filter(Boolean)
      : [];
    const single = typeof row.imageUrl === "string" ? row.imageUrl : null;
    const imageUrls = fromArray.length ? fromArray : single ? [single] : [];
    return {
      sku: String(row.sku || "").trim(),
      quantity: Math.max(1, Number(row.quantity) || 1),
      title: String(row.title || row.sku || "").trim(),
      brand: String(row.brand || "").trim(),
      imageUrl: imageUrls[0] || null,
      imageUrls,
    };
  }).filter((it) => it.sku);

  let lotPrice = parseLotPrice(d.lotPrice);
  if (lotPrice == null && itemsRaw.length) {
    const prices = itemsRaw
      .map((it) => parseLotPrice((it as Record<string, unknown>)?.price))
      .filter((p): p is number => p != null);
    if (prices.length && prices.every((p) => p === prices[0])) lotPrice = prices[0]!;
  }

  return {
    id,
    orgSlug: String(d.orgSlug || ""),
    organizationId: d.organizationId ? String(d.organizationId) : null,
    buyerUsername: normalizeBuyerUsername(String(d.buyerUsername || d.customerEmail || "")) || "",
    buyerDisplayName: String(d.buyerDisplayName || d.customerName || d.buyerUsername || ""),
    title: String(d.title || "Suggested lot"),
    note: String(d.note || ""),
    status: String(d.status || "active"),
    lotPrice,
    items,
    itemCount: Number(d.itemCount) || items.length,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    createdBy: d.createdBy ? String(d.createdBy) : undefined,
  };
}

export async function listSuggestedLots(opts?: {
  status?: "active" | "archived" | "all";
  buyerUsername?: string;
}): Promise<SuggestedLot[]> {
  const org = await getLuxesupplyOrg();
  const statusFilter = (opts?.status || "active").toLowerCase();
  const buyerUsername = opts?.buyerUsername
    ? normalizeBuyerUsername(opts.buyerUsername)
    : null;

  const db = getDb();
  let snap;
  try {
    let query = db
      .collection("salesPortalSuggestedLots")
      .where("organizationId", "==", org.id);
    if (buyerUsername) query = query.where("buyerUsername", "==", buyerUsername);
    snap = await query.limit(100).get();
  } catch {
    snap = await db
      .collection("salesPortalSuggestedLots")
      .where("organizationId", "==", org.id)
      .limit(100)
      .get();
  }

  return snap.docs
    .map((doc) => serializeLot(doc.id, doc.data() || {}))
    .filter((lot) => {
      if (statusFilter !== "all" && lot.status !== statusFilter) return false;
      if (buyerUsername && lot.buyerUsername !== buyerUsername) return false;
      return true;
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export async function getActiveLotsForBuyer(usernameRaw: string): Promise<SuggestedLot[]> {
  const username = normalizeBuyerUsername(usernameRaw);
  if (!username) return [];
  return listSuggestedLots({ status: "active", buyerUsername: username });
}

export async function getSuggestedLotById(id: string): Promise<SuggestedLot | null> {
  if (!id) return null;
  const snap = await getDb().collection("salesPortalSuggestedLots").doc(id).get();
  if (!snap.exists) return null;
  return serializeLot(snap.id, snap.data() || {});
}

export async function saveSuggestedLot(opts: {
  lotId?: string;
  buyerUsername: string;
  buyerDisplayName?: string;
  title: string;
  note?: string;
  lotPrice: number;
  items: { sku: string; title?: string; brand?: string; imageUrl?: string | null; imageUrls?: string[]; quantity?: number }[];
  staffEmail?: string;
}): Promise<SuggestedLot> {
  const username = normalizeBuyerUsername(opts.buyerUsername);
  if (!username) throw new Error("Choose a valid portal client");
  if (!opts.items.length) throw new Error("Add at least one SKU");
  if (!(opts.lotPrice >= 0)) throw new Error("Lot price is required");

  const org = await getLuxesupplyOrg();
  const db = getDb();
  const now = new Date();

  const seen = new Set<string>();
  const items: SuggestedLotItem[] = [];
  for (const raw of opts.items) {
    const sku = String(raw.sku || "").trim().slice(0, 80);
    if (!sku) continue;
    const key = sku.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const imageUrls = (
      Array.isArray(raw.imageUrls) && raw.imageUrls.length
        ? raw.imageUrls
        : raw.imageUrl
          ? [raw.imageUrl]
          : []
    )
      .map(String)
      .filter(Boolean)
      .slice(0, 20);
    items.push({
      sku,
      quantity: Math.max(1, Math.min(9999, Number(raw.quantity) || 1)),
      title: String(raw.title || sku).trim().slice(0, 200),
      brand: String(raw.brand || "").trim().slice(0, 120),
      imageUrl: imageUrls[0] || null,
      imageUrls,
    });
  }
  if (!items.length) throw new Error("Add at least one SKU");

  const payload = {
    orgSlug: WHOLESALE_ORG_SLUG,
    orgName: String(org.data.displayName || org.data.name || WHOLESALE_ORG_SLUG),
    organizationId: org.id,
    ownerUserId: null as string | null,
    uploadDirectory: UPLOAD_DIRECTORY,
    buyerUsername: username,
    buyerDisplayName: opts.buyerDisplayName || username,
    title: String(opts.title || "Suggested lot").trim().slice(0, 160) || "Suggested lot",
    note: String(opts.note || "").trim().slice(0, 2000),
    lotPrice: Math.round(opts.lotPrice),
    status: "active",
    items,
    itemCount: items.length,
    updatedAt: now,
    updatedBy: opts.staffEmail || "",
  };

  if (opts.lotId) {
    const ref = db.collection("salesPortalSuggestedLots").doc(opts.lotId);
    const existing = await ref.get();
    if (!existing.exists) throw new Error("Suggested lot not found");
    await ref.set(payload, { merge: true });
    const saved = await ref.get();
    return serializeLot(saved.id, saved.data() || {});
  }

  const ref = db.collection("salesPortalSuggestedLots").doc();
  await ref.set({
    ...payload,
    createdAt: now,
    createdBy: opts.staffEmail || "",
  });
  const saved = await ref.get();
  return serializeLot(saved.id, saved.data() || {});
}

export async function archiveSuggestedLot(lotId: string, staffEmail?: string): Promise<void> {
  if (!lotId) throw new Error("lotId is required");
  const ref = getDb().collection("salesPortalSuggestedLots").doc(lotId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Suggested lot not found");
  await ref.set(
    {
      status: "archived",
      updatedAt: new Date(),
      updatedBy: staffEmail || "",
    },
    { merge: true },
  );
}

/** SKUs currently locked inside an active suggested lot (should not appear as individual storefront sales). */
export async function listActiveBundledSkus(): Promise<Set<string>> {
  const lots = await listSuggestedLots({ status: "active" });
  const skus = new Set<string>();
  for (const lot of lots) {
    for (const item of lot.items) {
      const sku = String(item.sku || "").trim();
      if (sku) skus.add(sku.toUpperCase());
    }
  }
  return skus;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Archive active suggested lots older than `maxAgeDays` (default 14) so their
 * SKUs return to the individual storefront catalog. Intended for a daily cron.
 */
export async function expireStaleSuggestedLots(
  maxAgeDays = 14,
): Promise<{ archived: string[]; checked: number }> {
  const cutoff = Date.now() - Math.max(1, maxAgeDays) * MS_PER_DAY;
  const lots = await listSuggestedLots({ status: "active" });
  const archived: string[] = [];

  for (const lot of lots) {
    const anchor = lot.createdAt || lot.updatedAt;
    if (!anchor) continue;
    const ts = Date.parse(anchor);
    if (!Number.isFinite(ts) || ts > cutoff) continue;

    const ref = getDb().collection("salesPortalSuggestedLots").doc(lot.id);
    await ref.set(
      {
        status: "archived",
        updatedAt: new Date(),
        updatedBy: "system:expire-bundles",
        autoArchivedAt: new Date(),
        autoArchiveReason: `inactive_${maxAgeDays}_days`,
      },
      { merge: true },
    );
    archived.push(lot.id);
  }

  return { archived, checked: lots.length };
}
