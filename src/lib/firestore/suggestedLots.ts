import { cache } from "react";
import { getDb, toIso, WHOLESALE_ORG_SLUG, UPLOAD_DIRECTORY } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import { normalizeBuyerUsername } from "./buyers";
import { resolveTitlesForSkus } from "./catalog";

/** Short TTL so PDP / catalog lookups don't re-scan 300 lots on every click. */
const AVAILABILITY_TTL_MS = 15_000;
let availabilityCached: {
  at: number;
  value: { skus: string[]; revision: string };
} | null = null;
let availabilityInflight: Promise<{ skus: string[]; revision: string }> | null = null;

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
  /** When true, every buyer sees this lot on their storefront. */
  publishedToAll: boolean;
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

/** Active lots lock SKUs out of the individual catalog; anything else releases them. */
export function isActiveSuggestedLotStatus(status: unknown): boolean {
  const s = String(status ?? "active")
    .trim()
    .toLowerCase();
  return !s || s === "active";
}

function serializeLot(id: string, d: Record<string, unknown>): SuggestedLot {
  const itemsRaw = Array.isArray(d.items) ? d.items : [];
  const seenSkus = new Set<string>();
  const items: SuggestedLotItem[] = [];
  for (const it of itemsRaw) {
    const row = (it || {}) as Record<string, unknown>;
    const sku = String(row.sku || "").trim();
    if (!sku) continue;
    const skuKey = sku.toLowerCase();
    if (seenSkus.has(skuKey)) continue;
    seenSkus.add(skuKey);
    const fromArray = Array.isArray(row.imageUrls)
      ? row.imageUrls.map(String).filter(Boolean)
      : [];
    const single = typeof row.imageUrl === "string" ? row.imageUrl : null;
    const imageUrls = fromArray.length ? fromArray : single ? [single] : [];
    items.push({
      sku,
      quantity: Math.max(1, Number(row.quantity) || 1),
      title: String(row.title || row.sku || "").trim(),
      brand: String(row.brand || "").trim(),
      imageUrl: imageUrls[0] || null,
      imageUrls,
    });
  }

  let lotPrice = parseLotPrice(d.lotPrice);
  if (lotPrice == null && itemsRaw.length) {
    const prices = itemsRaw
      .map((it) => parseLotPrice((it as Record<string, unknown>)?.price))
      .filter((p): p is number => p != null);
    if (prices.length && prices.every((p) => p === prices[0])) lotPrice = prices[0]!;
  }

  const buyerUsername =
    normalizeBuyerUsername(String(d.buyerUsername || d.customerEmail || "")) || "";
  const publishedToAll =
    d.publishedToAll === true || String(d.audience || "").toLowerCase() === "all";

  const statusRaw = String(d.status || "active").trim().toLowerCase() || "active";

  return {
    id,
    orgSlug: String(d.orgSlug || ""),
    organizationId: d.organizationId ? String(d.organizationId) : null,
    buyerUsername: publishedToAll ? "" : buyerUsername,
    buyerDisplayName: publishedToAll
      ? String(d.buyerDisplayName || "All clients")
      : String(d.buyerDisplayName || d.customerName || d.buyerUsername || ""),
    publishedToAll,
    title: String(d.title || "Suggested lot"),
    note: String(d.note || ""),
    status: statusRaw,
    lotPrice,
    items,
    // Prefer deduped length so legacy duplicate SKUs don’t inflate the count.
    itemCount: items.length || Number(d.itemCount) || 0,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    createdBy: d.createdBy ? String(d.createdBy) : undefined,
  };
}

function needsLiveTitle(title: string, sku: string): boolean {
  const cleanTitle = String(title || "").trim();
  const cleanSku = String(sku || "").trim();
  return !cleanTitle || (!!cleanSku && cleanTitle.toLowerCase() === cleanSku.toLowerCase());
}

async function hydrateLotItemTitles(lots: SuggestedLot[]): Promise<SuggestedLot[]> {
  const skus = lots.flatMap((lot) =>
    lot.items.filter((item) => needsLiveTitle(item.title, item.sku)).map((item) => item.sku),
  );
  if (!skus.length) return lots;

  const titles = await resolveTitlesForSkus(skus);
  return lots.map((lot) => ({
    ...lot,
    items: lot.items.map((item) => {
      if (!needsLiveTitle(item.title, item.sku)) return item;
      const liveTitle = titles.get(item.sku) || titles.get(item.sku.toUpperCase());
      return liveTitle && !needsLiveTitle(liveTitle, item.sku)
        ? { ...item, title: liveTitle }
        : item;
    }),
  }));
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

  const lots = snap.docs
    .map((doc) => serializeLot(doc.id, doc.data() || {}))
    .filter((lot) => {
      if (statusFilter !== "all" && lot.status !== statusFilter) return false;
      if (buyerUsername && lot.buyerUsername !== buyerUsername) return false;
      return true;
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return hydrateLotItemTitles(lots);
}

export async function getActiveLotsForBuyer(usernameRaw: string): Promise<SuggestedLot[]> {
  const username = normalizeBuyerUsername(usernameRaw);
  if (!username) return [];
  const lots = await listSuggestedLots({ status: "active" });
  return lots.filter(
    (lot) => lot.publishedToAll || !lot.buyerUsername || lot.buyerUsername === username,
  );
}

export async function getSuggestedLotById(id: string): Promise<SuggestedLot | null> {
  if (!id) return null;
  const snap = await getDb().collection("salesPortalSuggestedLots").doc(id).get();
  if (!snap.exists) return null;
  const hydrated = await hydrateLotItemTitles([serializeLot(snap.id, snap.data() || {})]);
  return hydrated[0] || null;
}

export async function saveSuggestedLot(opts: {
  lotId?: string;
  /** Empty / omitted + publishedToAll publishes to every buyer. */
  buyerUsername?: string;
  buyerDisplayName?: string;
  publishedToAll?: boolean;
  title: string;
  note?: string;
  lotPrice: number;
  items: { sku: string; title?: string; brand?: string; imageUrl?: string | null; imageUrls?: string[]; quantity?: number }[];
  staffEmail?: string;
}): Promise<SuggestedLot> {
  const publishedToAll = opts.publishedToAll === true || !String(opts.buyerUsername || "").trim();
  const username = publishedToAll ? "" : normalizeBuyerUsername(opts.buyerUsername || "");
  if (!publishedToAll && !username) throw new Error("Choose a valid portal client");
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
    buyerDisplayName: publishedToAll
      ? "All clients"
      : opts.buyerDisplayName || username,
    publishedToAll,
    audience: publishedToAll ? "all" : "client",
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
    // merge:true still replaces the top-level `items` array, releasing removed SKUs.
    await ref.set(payload, { merge: true });
    const saved = await ref.get();
    const hydrated = await hydrateLotItemTitles([serializeLot(saved.id, saved.data() || {})]);
    return hydrated[0]!;
  }

  const ref = db.collection("salesPortalSuggestedLots").doc();
  await ref.set({
    ...payload,
    createdAt: now,
    createdBy: opts.staffEmail || "",
  });
  const saved = await ref.get();
  const hydrated = await hydrateLotItemTitles([serializeLot(saved.id, saved.data() || {})]);
  return hydrated[0]!;
}

export async function archiveSuggestedLot(lotId: string, staffEmail?: string): Promise<void> {
  if (!lotId) throw new Error("lotId is required");
  const ref = getDb().collection("salesPortalSuggestedLots").doc(lotId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Suggested lot not found");
  await ref.set(
    {
      status: "archived",
      archivedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: staffEmail || "",
    },
    { merge: true },
  );
}

function lotUpdatedMs(d: Record<string, unknown>): number {
  const raw = d.updatedAt ?? d.archivedAt ?? d.createdAt;
  if (raw && typeof raw === "object" && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate().getTime();
  }
  if (raw && typeof raw === "object" && "seconds" in raw) {
    return Number((raw as { seconds: number }).seconds) * 1000;
  }
  if (raw instanceof Date) return raw.getTime();
  return 0;
}

async function fetchStorefrontAvailabilitySnapshot(): Promise<{
  skus: string[];
  revision: string;
}> {
  const org = await getLuxesupplyOrg();
  const snap = await getDb()
    .collection("salesPortalSuggestedLots")
    .where("organizationId", "==", org.id)
    .limit(300)
    .get();

  const skus = new Set<string>();
  const lotParts: string[] = [];
  let touchMs = 0;

  for (const doc of snap.docs) {
    const d = (doc.data() || {}) as Record<string, unknown>;
    touchMs = Math.max(touchMs, lotUpdatedMs(d));
    // Archived / inactive lots release their SKUs back to the individual catalog.
    if (!isActiveSuggestedLotStatus(d.status)) continue;
    lotParts.push(`${doc.id}:${lotUpdatedMs(d)}`);
    const items = Array.isArray(d.items) ? d.items : [];
    for (const item of items) {
      const row = (item || {}) as Record<string, unknown>;
      const sku = String(row.sku || "").trim();
      if (sku) skus.add(sku.toUpperCase());
    }
  }

  const skuList = [...skus].sort();
  // Include org-wide touch time so archive/edit always changes revision for open buyer tabs.
  const revision = `${lotParts.sort().join("|")}#${skuList.join(",")}#t${touchMs}`;
  return { skus: skuList, revision };
}

/**
 * Active-lot SKUs + revision token for live storefront polling.
 * Per-request memoized + 15s process cache — PDP used to re-scan lots on every navigation.
 */
export const getStorefrontAvailabilitySnapshot = cache(
  async (): Promise<{ skus: string[]; revision: string }> => {
    const now = Date.now();
    if (availabilityCached && now - availabilityCached.at < AVAILABILITY_TTL_MS) {
      return availabilityCached.value;
    }
    if (!availabilityInflight) {
      availabilityInflight = fetchStorefrontAvailabilitySnapshot()
        .then((value) => {
          availabilityCached = { at: Date.now(), value };
          return value;
        })
        .finally(() => {
          availabilityInflight = null;
        });
    }
    try {
      return await availabilityInflight;
    } catch (err) {
      if (availabilityCached) return availabilityCached.value;
      throw err;
    }
  },
);

/** SKUs currently locked inside an active suggested lot (should not appear as individual storefront sales). */
export async function listActiveBundledSkus(): Promise<Set<string>> {
  const { skus } = await getStorefrontAvailabilitySnapshot();
  return new Set(skus);
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
