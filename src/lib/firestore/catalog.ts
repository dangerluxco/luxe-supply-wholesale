import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb, toIso, UPLOAD_DIRECTORY, WHOLESALE_ORG_SLUG } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import { loadActiveHoldsBySku, type PortalHold } from "./holds";
import { listActiveBundledSkus } from "./suggestedLots";

export type CatalogProduct = {
  sku: string;
  title: string;
  brand: string;
  price: number | null;
  priceLabel: string;
  imageUrl: string | null;
  imageUrls: string[];
  hostCompAvgUsd: number | null;
  soldOut: boolean;
  /** Held by another buyer (blocks purchase). */
  held: boolean;
  /** Soft-held by the current signed-in buyer. */
  heldByYou: boolean;
  heldUntil: string | null;
  condition: string;
  material: string;
  era: string;
  location: string;
};

/** One row of the sales manager's curated (SKU allowlist) catalog. */
export type CuratedCatalogItem = {
  sku: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  /** Whether the SKU resolved against uploadHistory / IIQItemDetails. */
  inDb: boolean;
  cost: number | null;
  /** Staff-facing wholesale price actually used on the storefront. */
  price: number | null;
  priceOverridden: boolean;
};

export type CuratedCatalog = {
  items: CuratedCatalogItem[];
  unresolvedSkus: string[];
  updatedAt: string | null;
  updatedBy: string;
};

function getIiqListingPrice(iiq: Record<string, unknown> | null): string {
  if (!iiq) return "";
  const sale = iiq["Sale Price"];
  if (sale != null && String(sale).trim() !== "") return String(sale).trim();
  const p = iiq.price;
  if (p != null && String(p).trim() !== "") return String(p).trim();
  return "";
}

function parseMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Staff-facing default: cost marked up to an 80% cost ratio, rounded to whole dollars (catalog prices are whole USD). */
function defaultPriceFromCost(cost: number | null): number | null {
  if (cost == null || !Number.isFinite(cost) || cost <= 0) return null;
  return Math.round(cost / 0.8);
}

type UploadGroup = {
  sku: string;
  imageUrls: string[];
  brand: string;
  hostCompAvgUsd: number | null;
  /** Denormalized cost synced onto uploadHistory (see `inventoryCost` in utils/uploadHistory.ts). */
  inventoryCost: number | null;
  titleHint: string;
};

function groupUploads(docs: QueryDocumentSnapshot[]): UploadGroup[] {
  const grouped = new Map<string, UploadGroup>();
  docs.forEach((doc) => {
    const d = doc.data() || {};
    const sku = String(d.sku || "").trim();
    if (!sku) return;
    const key = `${sku}_${d.userEmail || ""}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        sku,
        imageUrls: [],
        brand: String(d.brand || "").trim(),
        hostCompAvgUsd: null,
        inventoryCost: null,
        titleHint: String(d.title || d.productName || "").trim(),
      });
    }
    const g = grouped.get(key)!;
    if (Array.isArray(d.imageUrls)) {
      d.imageUrls.forEach((url: unknown) => {
        if (url && !g.imageUrls.includes(String(url))) g.imageUrls.push(String(url));
      });
    }
    const avg = d.hostCompAvgUsd;
    if (typeof avg === "number" && Number.isFinite(avg)) g.hostCompAvgUsd = avg;
    const cost = d.inventoryCost;
    if (typeof cost === "number" && Number.isFinite(cost)) g.inventoryCost = cost;
  });
  return Array.from(grouped.values());
}

/** Merge the (possibly several, one per uploader) UploadGroup rows for a single SKU into one. */
function mergeUploadGroups(groups: UploadGroup[]): UploadGroup | null {
  if (!groups.length) return null;
  const merged: UploadGroup = {
    sku: groups[0]!.sku,
    imageUrls: [],
    brand: "",
    hostCompAvgUsd: null,
    inventoryCost: null,
    titleHint: "",
  };
  for (const g of groups) {
    for (const url of g.imageUrls) {
      if (!merged.imageUrls.includes(url)) merged.imageUrls.push(url);
    }
    if (!merged.brand && g.brand) merged.brand = g.brand;
    if (!merged.titleHint && g.titleHint) merged.titleHint = g.titleHint;
    if (g.hostCompAvgUsd != null) merged.hostCompAvgUsd = g.hostCompAvgUsd;
    if (g.inventoryCost != null) merged.inventoryCost = g.inventoryCost;
  }
  return merged;
}

async function loadIiqBySku(
  skus: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const db = getDb();
  const unique = [...new Set(skus.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const snaps = await Promise.all(
      chunk.map(async (sku) => {
        let snap = await db
          .collection("IIQItemDetails")
          .where("sku", "==", sku)
          .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
          .limit(5)
          .get();
        if (snap.empty && sku !== sku.toUpperCase()) {
          snap = await db
            .collection("IIQItemDetails")
            .where("sku", "==", sku.toUpperCase())
            .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
            .limit(5)
            .get();
        }
        return snap;
      }),
    );
    snaps.forEach((snap, idx) => {
      if (snap.empty) return;
      let best: Record<string, unknown> | null = null;
      snap.forEach((doc) => {
        const data = doc.data() || {};
        if (!best) best = data;
        else if (data.claimedBy && !best.claimedBy) best = data;
      });
      if (best) map.set(chunk[idx]!, best);
    });
  }
  return map;
}

/** Direct-by-SKU uploadHistory lookup (not limited to a recent window) — used to resolve
 * arbitrary, possibly-old SKUs pasted into the curated catalog builder. */
async function loadUploadGroupsBySku(skus: string[]): Promise<Map<string, UploadGroup>> {
  const map = new Map<string, UploadGroup>();
  const db = getDb();
  const unique = [...new Set(skus.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const snaps = await Promise.all(
      chunk.map(async (sku) => {
        let snap = await db
          .collection("uploadHistory")
          .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
          .where("sku", "==", sku)
          .limit(25)
          .get();
        if (snap.empty && sku !== sku.toUpperCase()) {
          snap = await db
            .collection("uploadHistory")
            .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
            .where("sku", "==", sku.toUpperCase())
            .limit(25)
            .get();
        }
        return snap;
      }),
    );
    snaps.forEach((snap, idx) => {
      if (snap.empty) return;
      const merged = mergeUploadGroups(groupUploads(snap.docs));
      if (merged) map.set(chunk[idx]!, merged);
    });
  }
  return map;
}

function toCatalogProduct(
  sku: string,
  group: UploadGroup | null,
  iiq: Record<string, unknown> | null,
  hold: PortalHold | undefined,
  buyerUsername: string,
  overrides?: {
    price?: number | null;
    title?: string;
    brand?: string;
    imageUrl?: string | null;
  },
): CatalogProduct {
  const priceLabel = getIiqListingPrice(iiq);
  const title =
    String((iiq && (iiq.Title || iiq.title || iiq.productName)) || "").trim() ||
    group?.titleHint ||
    overrides?.title ||
    sku;
  const brand = String((iiq && (iiq.Brand || iiq.brand)) || group?.brand || overrides?.brand || "").trim();
  const soldOut = !!(iiq && (iiq.sold === true || iiq.Sold === true));
  const condition = String((iiq && (iiq.Condition || iiq.condition)) || "").trim() || "—";
  const material = String((iiq && (iiq.Material || iiq.material)) || "").trim() || "—";
  const era = String((iiq && (iiq.Era || iiq.era || iiq.Period)) || "").trim() || "—";
  const heldByYou = !!(hold && buyerUsername && hold.portalUsername === buyerUsername);
  const heldByOther = !!(hold && !heldByYou);
  const imageUrls = group?.imageUrls?.length
    ? group.imageUrls
    : overrides?.imageUrl
      ? [overrides.imageUrl]
      : [];
  const price = overrides && "price" in overrides ? overrides.price ?? null : parseMoney(priceLabel);

  return {
    sku,
    title,
    brand,
    price,
    priceLabel,
    imageUrl: imageUrls[0] || null,
    imageUrls,
    hostCompAvgUsd: group?.hostCompAvgUsd ?? null,
    soldOut,
    held: heldByOther,
    heldByYou,
    heldUntil: hold?.heldUntil || null,
    condition,
    material,
    era,
    location: "VAULT",
  };
}

/** Live-hydrate a saved curated catalog's rows (image/title/sold status) while keeping the staff-set price. */
async function hydrateCuratedItems(
  items: CuratedCatalogItem[],
  opts?: { buyerUsername?: string | null },
): Promise<CatalogProduct[]> {
  if (!items.length) return [];
  const buyerUsername = String(opts?.buyerUsername || "").trim().toLowerCase();
  const skus = items.map((i) => i.sku);
  const [uploadMap, iiqMap, holds] = await Promise.all([
    loadUploadGroupsBySku(skus),
    loadIiqBySku(skus),
    loadActiveHoldsBySku(skus),
  ]);

  return items.map((item) =>
    toCatalogProduct(
      item.sku,
      uploadMap.get(item.sku) || null,
      iiqMap.get(item.sku) || null,
      holds.get(item.sku),
      buyerUsername,
      {
        price: item.price,
        title: item.title,
        brand: item.brand,
        imageUrl: item.imageUrl,
      },
    ),
  );
}

function parseCuratedCatalog(raw: unknown): CuratedCatalog | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.items) || !d.items.length) return null;
  const items: CuratedCatalogItem[] = (d.items as Record<string, unknown>[])
    .map((it) => ({
      sku: String(it.sku || "").trim(),
      title: String(it.title || "").trim(),
      brand: String(it.brand || "").trim(),
      imageUrl: it.imageUrl ? String(it.imageUrl) : null,
      inDb: !!it.inDb,
      cost: typeof it.cost === "number" && Number.isFinite(it.cost) ? it.cost : null,
      price: typeof it.price === "number" && Number.isFinite(it.price) ? it.price : null,
      priceOverridden: !!it.priceOverridden,
    }))
    .filter((it) => it.sku);
  if (!items.length) return null;
  return {
    items,
    unresolvedSkus: Array.isArray(d.unresolvedSkus)
      ? d.unresolvedSkus.map((s) => String(s).trim()).filter(Boolean)
      : [],
    updatedAt: toIso(d.updatedAt),
    updatedBy: String(d.updatedBy || ""),
  };
}

/**
 * Resolve a raw pasted SKU list against the inventory DB for the curated catalog
 * builder's review step. Every input SKU produces exactly one row — unresolved
 * SKUs are kept (marked `inDb: false`, `cost`/`price: null`) rather than dropped,
 * so the manager can see and deal with them in the review table.
 */
export async function resolveCuratedDraftItems(
  skusRaw: string[],
): Promise<{ items: CuratedCatalogItem[]; unresolvedSkus: string[] }> {
  const seen = new Set<string>();
  const cleanSkus: string[] = [];
  for (const raw of skusRaw) {
    const sku = String(raw || "").trim();
    if (!sku) continue;
    const key = sku.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleanSkus.push(sku);
  }
  if (!cleanSkus.length) return { items: [], unresolvedSkus: [] };

  const [uploadMap, iiqMap] = await Promise.all([
    loadUploadGroupsBySku(cleanSkus),
    loadIiqBySku(cleanSkus),
  ]);

  const items: CuratedCatalogItem[] = cleanSkus.map((sku) => {
    const group = uploadMap.get(sku) || null;
    const iiq = iiqMap.get(sku) || null;
    const inDb = !!group || !!iiq;
    const resolvedSku = group?.sku || sku;
    const title =
      String((iiq && (iiq.Title || iiq.title || iiq.productName)) || "").trim() ||
      group?.titleHint ||
      "";
    const brand = String((iiq && (iiq.Brand || iiq.brand)) || group?.brand || "").trim();
    const imageUrl = group?.imageUrls[0] || null;
    const iiqCost =
      iiq && typeof iiq.cost === "number" && Number.isFinite(iiq.cost as number)
        ? (iiq.cost as number)
        : null;
    const cost = group?.inventoryCost ?? iiqCost ?? null;
    const price = defaultPriceFromCost(cost);
    return {
      sku: resolvedSku,
      title: title || resolvedSku,
      brand,
      imageUrl,
      inDb,
      cost,
      price,
      priceOverridden: false,
    };
  });

  const unresolvedSkus = items.filter((i) => !i.inDb).map((i) => i.sku);
  return { items, unresolvedSkus };
}

/** Persist the reviewed curated catalog — overwrites any previously saved catalog and switches the live mode to `sku_list`. */
export async function saveCuratedCatalog(input: {
  items: CuratedCatalogItem[];
  unresolvedSkus?: string[];
  updatedBy: string;
}): Promise<void> {
  const org = await getLuxesupplyOrg();
  const ref = getDb().collection("organizations").doc(org.id);
  const prev = (org.data.salesPortal || {}) as Record<string, unknown>;

  const cleanItems = input.items
    .map((i) => ({
      sku: String(i.sku || "").trim(),
      title: String(i.title || "").trim(),
      brand: String(i.brand || "").trim(),
      imageUrl: i.imageUrl ? String(i.imageUrl) : null,
      inDb: !!i.inDb,
      cost: i.cost != null && Number.isFinite(Number(i.cost)) ? Number(i.cost) : null,
      price: i.price != null && Number.isFinite(Number(i.price)) ? Math.max(0, Number(i.price)) : null,
      priceOverridden: !!i.priceOverridden,
    }))
    .filter((i) => i.sku);

  const unresolvedSkus = [
    ...new Set((input.unresolvedSkus || []).map((s) => String(s || "").trim()).filter(Boolean)),
  ];

  await ref.set(
    {
      salesPortal: {
        ...prev,
        catalogSelection: {
          mode: "sku_list",
          skus: cleanItems.map((i) => i.sku),
        },
        curatedCatalog: {
          items: cleanItems,
          unresolvedSkus,
          updatedAt: new Date(),
          updatedBy: input.updatedBy || "",
        },
        updatedAt: new Date(),
      },
      updatedAt: new Date(),
    },
    { merge: true },
  );
}

/** Switch between "all" (testing) and "sku_list" (curated) without touching stored SKUs/curated data. */
export async function setCatalogMode(mode: "all" | "sku_list"): Promise<void> {
  const org = await getLuxesupplyOrg();
  const ref = getDb().collection("organizations").doc(org.id);
  const prev = (org.data.salesPortal || {}) as Record<string, unknown>;
  const prevSelection = (prev.catalogSelection || {}) as Record<string, unknown>;
  await ref.set(
    {
      salesPortal: {
        ...prev,
        catalogSelection: {
          ...prevSelection,
          mode,
        },
        updatedAt: new Date(),
      },
      updatedAt: new Date(),
    },
    { merge: true },
  );
}

/** Current mode/curated-catalog state for the rep catalog settings page. */
export async function getCatalogSettingsState(): Promise<{
  mode: string;
  skus: string[];
  curatedCatalog: CuratedCatalog | null;
  orgName: string;
}> {
  const org = await getLuxesupplyOrg();
  const salesPortal = (org.data.salesPortal || {}) as Record<string, unknown>;
  const catalogSelectionRaw = (salesPortal.catalogSelection || {}) as Record<string, unknown>;
  return {
    mode: String(catalogSelectionRaw.mode || "all"),
    skus: Array.isArray(catalogSelectionRaw.skus)
      ? catalogSelectionRaw.skus.map((s) => String(s).trim()).filter(Boolean)
      : [],
    curatedCatalog: parseCuratedCatalog(salesPortal.curatedCatalog),
    orgName: String(org.data.displayName || org.data.name || WHOLESALE_ORG_SLUG),
  };
}

export async function listCatalogProducts(
  limit = 60,
  opts?: { buyerUsername?: string | null },
): Promise<{
  products: CatalogProduct[];
  catalogSelection: { mode: string; skus: string[] };
  orgName: string;
  hasMore: boolean;
}> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 60, 24), 800);
  const buyerUsername = String(opts?.buyerUsername || "")
    .trim()
    .toLowerCase();
  const org = await getLuxesupplyOrg();
  const salesPortal = (org.data.salesPortal || {}) as Record<string, unknown>;
  const catalogSelectionRaw = (salesPortal.catalogSelection || {}) as Record<string, unknown>;
  const catalogSelection = {
    mode: String(catalogSelectionRaw.mode || "all"),
    skus: Array.isArray(catalogSelectionRaw.skus)
      ? catalogSelectionRaw.skus.map((s) => String(s).trim()).filter(Boolean)
      : [],
  };
  const orgName = String(org.data.displayName || org.data.name || WHOLESALE_ORG_SLUG);

  // Curated mode with a saved catalog: list exactly those SKUs at the staff-set
  // price (never a live re-filter), hydrating image/title/sold status live.
  if (catalogSelection.mode === "sku_list") {
    const curatedCatalog = parseCuratedCatalog(salesPortal.curatedCatalog);
    if (curatedCatalog && curatedCatalog.items.length) {
      const bundled = await listActiveBundledSkus();
      const sellable = curatedCatalog.items.filter(
        (i) => i.price != null && !bundled.has(i.sku.toUpperCase()),
      );
      const page = sellable.slice(0, safeLimit);
      const hasMore = sellable.length > safeLimit;
      const products = await hydrateCuratedItems(page, { buyerUsername });
      return { products, catalogSelection, orgName, hasMore };
    }
  }

  const db = getDb();
  // Fetch extra upload docs so deduped SKUs can still fill `safeLimit`
  const uploadCap = Math.min(Math.max(safeLimit * 5, 200), 2500);
  let snap;
  try {
    snap = await db
      .collection("uploadHistory")
      .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
      .orderBy("updatedAt", "desc")
      .limit(uploadCap)
      .get();
  } catch {
    snap = await db
      .collection("uploadHistory")
      .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
      .limit(uploadCap)
      .get();
  }

  let groups = groupUploads(snap.docs);
  if (catalogSelection.mode === "sku_list" && catalogSelection.skus.length) {
    const allow = new Set(catalogSelection.skus.map((s) => s.toUpperCase()));
    groups = groups.filter((g) => allow.has(g.sku.toUpperCase()));
  }

  const bundled = await listActiveBundledSkus();
  if (bundled.size) {
    groups = groups.filter((g) => !bundled.has(g.sku.toUpperCase()));
  }

  // Dedupe by SKU keeping first (most recently updated group)
  const bySku = new Map<string, UploadGroup>();
  for (const g of groups) {
    if (!bySku.has(g.sku)) bySku.set(g.sku, g);
  }
  const unique = Array.from(bySku.values());
  const page = unique.slice(0, safeLimit);
  const hasMore = unique.length > safeLimit || snap.size >= uploadCap;
  const skus = page.map((g) => g.sku);
  const [iiqMap, holds] = await Promise.all([
    loadIiqBySku(skus),
    loadActiveHoldsBySku(skus),
  ]);

  const products: CatalogProduct[] = page.map((g) =>
    toCatalogProduct(g.sku, g, iiqMap.get(g.sku) || null, holds.get(g.sku), buyerUsername),
  );

  return { products, catalogSelection, orgName, hasMore };
}

/**
 * Direct-by-SKU lookup (bypasses the paginated `listCatalogProducts` scan) so
 * `/wholesale/product/[sku]` works for any known SKU regardless of catalog size or
 * upload recency — the previous implementation only searched the first 200
 * newest-updated products, so older SKUs 404'd even when they existed.
 */
export async function getCatalogProductBySku(
  skuRaw: string,
  opts?: { buyerUsername?: string | null },
): Promise<CatalogProduct | null> {
  const sku = String(skuRaw || "").trim();
  if (!sku) return null;
  const buyerUsername = String(opts?.buyerUsername || "")
    .trim()
    .toLowerCase();

  const bundled = await listActiveBundledSkus();
  if (bundled.has(sku.toUpperCase())) return null;

  const org = await getLuxesupplyOrg();
  const salesPortal = (org.data.salesPortal || {}) as Record<string, unknown>;
  const catalogSelectionRaw = (salesPortal.catalogSelection || {}) as Record<string, unknown>;
  const catalogMode = String(catalogSelectionRaw.mode || "all");

  if (catalogMode === "sku_list") {
    const curatedCatalog = parseCuratedCatalog(salesPortal.curatedCatalog);
    if (curatedCatalog && curatedCatalog.items.length) {
      const item = curatedCatalog.items.find((i) => i.sku.toUpperCase() === sku.toUpperCase());
      if (!item || item.price == null) return null;
      const hydrated = await hydrateCuratedItems([item], { buyerUsername });
      return hydrated[0] || null;
    }
    if (Array.isArray(catalogSelectionRaw.skus)) {
      const allow = new Set(
        catalogSelectionRaw.skus.map((s) => String(s).trim().toUpperCase()).filter(Boolean),
      );
      if (allow.size && !allow.has(sku.toUpperCase())) return null;
    }
  }

  const db = getDb();
  let snap = await db
    .collection("uploadHistory")
    .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
    .where("sku", "==", sku)
    .limit(25)
    .get();
  if (snap.empty && sku !== sku.toUpperCase()) {
    snap = await db
      .collection("uploadHistory")
      .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
      .where("sku", "==", sku.toUpperCase())
      .limit(25)
      .get();
  }
  if (snap.empty) return null;

  const groups = groupUploads(snap.docs);
  const group =
    groups.find((g) => g.sku.toUpperCase() === sku.toUpperCase()) || groups[0] || null;
  if (!group) return null;

  const [iiqMap, holds] = await Promise.all([
    loadIiqBySku([group.sku]),
    loadActiveHoldsBySku([group.sku]),
  ]);

  return toCatalogProduct(
    group.sku,
    group,
    iiqMap.get(group.sku) || null,
    holds.get(group.sku),
    buyerUsername,
  );
}

/** Mark inventory SKUs as sold so they drop from the wholesale storefront. */
export async function markSkusSold(skus: string[]): Promise<{ updated: number }> {
  const unique = [...new Set(skus.map((s) => String(s || "").trim()).filter(Boolean))];
  if (!unique.length) return { updated: 0 };

  const db = getDb();
  let updated = 0;
  const now = new Date();

  for (const sku of unique) {
    let snap = await db
      .collection("IIQItemDetails")
      .where("sku", "==", sku)
      .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
      .limit(20)
      .get();
    if (snap.empty && sku !== sku.toUpperCase()) {
      snap = await db
        .collection("IIQItemDetails")
        .where("sku", "==", sku.toUpperCase())
        .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
        .limit(20)
        .get();
    }
    if (snap.empty) continue;
    const batch = db.batch();
    snap.forEach((doc) => {
      batch.set(
        doc.ref,
        {
          sold: true,
          Sold: true,
          soldAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
      updated += 1;
    });
    await batch.commit();
  }

  return { updated };
}

export async function saveCatalogSelection(input: {
  mode: "all" | "sku_list";
  skus: string[];
}): Promise<void> {
  const org = await getLuxesupplyOrg();
  const ref = getDb().collection("organizations").doc(org.id);
  const prev = (org.data.salesPortal || {}) as Record<string, unknown>;
  await ref.set(
    {
      salesPortal: {
        ...prev,
        catalogSelection: {
          mode: input.mode,
          skus: input.mode === "sku_list" ? input.skus : [],
        },
        updatedAt: new Date(),
      },
      updatedAt: new Date(),
    },
    { merge: true },
  );
}
