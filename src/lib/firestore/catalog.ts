import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb, UPLOAD_DIRECTORY, WHOLESALE_ORG_SLUG } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import { loadActiveHoldsBySku } from "./holds";

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

type UploadGroup = {
  sku: string;
  imageUrls: string[];
  brand: string;
  hostCompAvgUsd: number | null;
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
  });
  return Array.from(grouped.values());
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
      chunk.map((sku) =>
        db
          .collection("IIQItemDetails")
          .where("sku", "==", sku)
          .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
          .limit(5)
          .get(),
      ),
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

  const products: CatalogProduct[] = page.map((g) => {
    const iiq = iiqMap.get(g.sku) || null;
    const priceLabel = getIiqListingPrice(iiq);
    const title =
      String((iiq && (iiq.Title || iiq.title || iiq.productName)) || "").trim() ||
      g.titleHint ||
      g.sku;
    const brand = String((iiq && (iiq.Brand || iiq.brand)) || g.brand || "").trim();
    const soldOut = !!(iiq && (iiq.sold === true || iiq.Sold === true));
    const condition = String((iiq && (iiq.Condition || iiq.condition)) || "").trim() || "—";
    const material = String((iiq && (iiq.Material || iiq.material)) || "").trim() || "—";
    const era = String((iiq && (iiq.Era || iiq.era || iiq.Period)) || "").trim() || "—";
    const hold = holds.get(g.sku);
    const heldByYou = !!(hold && buyerUsername && hold.portalUsername === buyerUsername);
    const heldByOther = !!(hold && !heldByYou);
    return {
      sku: g.sku,
      title,
      brand,
      price: parseMoney(priceLabel),
      priceLabel,
      imageUrl: g.imageUrls[0] || null,
      imageUrls: g.imageUrls,
      hostCompAvgUsd: g.hostCompAvgUsd,
      soldOut,
      held: heldByOther,
      heldByYou,
      heldUntil: hold?.heldUntil || null,
      condition,
      material,
      era,
      location: "VAULT",
    };
  });

  return {
    products,
    catalogSelection,
    orgName: String(org.data.displayName || org.data.name || WHOLESALE_ORG_SLUG),
    hasMore,
  };
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

  const org = await getLuxesupplyOrg();
  const salesPortal = (org.data.salesPortal || {}) as Record<string, unknown>;
  const catalogSelectionRaw = (salesPortal.catalogSelection || {}) as Record<string, unknown>;
  const catalogMode = String(catalogSelectionRaw.mode || "all");
  if (catalogMode === "sku_list" && Array.isArray(catalogSelectionRaw.skus)) {
    const allow = new Set(
      catalogSelectionRaw.skus.map((s) => String(s).trim().toUpperCase()).filter(Boolean),
    );
    if (allow.size && !allow.has(sku.toUpperCase())) return null;
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
  const iiq = iiqMap.get(group.sku) || null;
  const priceLabel = getIiqListingPrice(iiq);
  const title =
    String((iiq && (iiq.Title || iiq.title || iiq.productName)) || "").trim() ||
    group.titleHint ||
    group.sku;
  const brand = String((iiq && (iiq.Brand || iiq.brand)) || group.brand || "").trim();
  const soldOut = !!(iiq && (iiq.sold === true || iiq.Sold === true));
  const condition = String((iiq && (iiq.Condition || iiq.condition)) || "").trim() || "—";
  const material = String((iiq && (iiq.Material || iiq.material)) || "").trim() || "—";
  const era = String((iiq && (iiq.Era || iiq.era || iiq.Period)) || "").trim() || "—";
  const hold = holds.get(group.sku);
  const heldByYou = !!(hold && buyerUsername && hold.portalUsername === buyerUsername);
  const heldByOther = !!(hold && !heldByYou);

  return {
    sku: group.sku,
    title,
    brand,
    price: parseMoney(priceLabel),
    priceLabel,
    imageUrl: group.imageUrls[0] || null,
    imageUrls: group.imageUrls,
    hostCompAvgUsd: group.hostCompAvgUsd,
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
