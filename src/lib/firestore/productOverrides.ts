import { createHash, randomUUID } from "crypto";
import { getDb, getBucket, toIso, WHOLESALE_ORG_SLUG } from "./admin";

/**
 * Staff-editable per-SKU product record layered on top of the read-only
 * inventory facts (uploadHistory / IIQItemDetails / askIIQResults). Any field
 * left null/empty falls back to the live-resolved inventory value — this
 * collection only stores what staff have explicitly overridden.
 */
export type ProductOverrides = {
  sku: string;
  title: string | null;
  brand: string | null;
  category: string | null;
  description: string | null;
  era: string | null;
  material: string | null;
  origin: string | null;
  provenance: string | null;
  condition: string | null;
  marks: string | null;
  dimensions: string | null;
  vaultLocation: string | null;
  costOverride: number | null;
  listPriceOverride: number | null;
  salePriceOverride: number | null;
  /** Full replacement image list — null/empty means "use inventory images". */
  images: string[] | null;
  updatedAt: string | null;
  updatedBy: string;
};

export function productOverrideDocId(sku: string): string {
  const raw = `${WHOLESALE_ORG_SLUG}__${sku}`.trim().toLowerCase();
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function takeTextOrNull(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
}

function takeNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function emptyOverrides(sku: string): ProductOverrides {
  return {
    sku,
    title: null,
    brand: null,
    category: null,
    description: null,
    era: null,
    material: null,
    origin: null,
    provenance: null,
    condition: null,
    marks: null,
    dimensions: null,
    vaultLocation: null,
    costOverride: null,
    listPriceOverride: null,
    salePriceOverride: null,
    images: null,
    updatedAt: null,
    updatedBy: "",
  };
}

function serializeOverrides(sku: string, d: Record<string, unknown>): ProductOverrides {
  return {
    sku,
    title: takeTextOrNull(d.title),
    brand: takeTextOrNull(d.brand),
    category: takeTextOrNull(d.category),
    description: takeTextOrNull(d.description),
    era: takeTextOrNull(d.era),
    material: takeTextOrNull(d.material),
    origin: takeTextOrNull(d.origin),
    provenance: takeTextOrNull(d.provenance),
    condition: takeTextOrNull(d.condition),
    marks: takeTextOrNull(d.marks),
    dimensions: takeTextOrNull(d.dimensions),
    vaultLocation: takeTextOrNull(d.vaultLocation),
    costOverride: takeNumberOrNull(d.costOverride),
    listPriceOverride: takeNumberOrNull(d.listPriceOverride),
    salePriceOverride: takeNumberOrNull(d.salePriceOverride),
    images:
      Array.isArray(d.images) && d.images.length
        ? d.images.map((u) => String(u)).filter(Boolean)
        : null,
    updatedAt: toIso(d.updatedAt),
    updatedBy: String(d.updatedBy || ""),
  };
}

export async function getProductOverrides(skuRaw: string): Promise<ProductOverrides> {
  const sku = String(skuRaw || "").trim();
  if (!sku) return emptyOverrides(sku);
  const db = getDb();
  const snap = await db.collection("salesPortalProductOverrides").doc(productOverrideDocId(sku)).get();
  if (!snap.exists) return emptyOverrides(sku);
  return serializeOverrides(sku, snap.data() || {});
}

/** Batch-load overrides for many SKUs at once (e.g. to search/filter a full catalog page
 * by staff-entered category/description) — same chunked db.getAll() pattern as holds.ts.
 * Only returns entries for SKUs that actually have an override doc. */
export async function loadProductOverridesBySku(skusRaw: string[]): Promise<Map<string, ProductOverrides>> {
  const map = new Map<string, ProductOverrides>();
  const unique = [...new Set(skusRaw.map((s) => String(s || "").trim()).filter(Boolean))];
  if (!unique.length) return map;

  const db = getDb();
  const refs = unique.map((sku) => db.collection("salesPortalProductOverrides").doc(productOverrideDocId(sku)));

  for (let i = 0; i < refs.length; i += 40) {
    const chunk = refs.slice(i, i + 40);
    const skuChunk = unique.slice(i, i + 40);
    let snaps;
    try {
      snaps = await db.getAll(...chunk);
    } catch (err) {
      console.warn("[productOverrides] loadProductOverridesBySku getAll:", err instanceof Error ? err.message : err);
      continue;
    }
    snaps.forEach((snap, idx) => {
      if (!snap.exists) return;
      const sku = skuChunk[idx]!;
      map.set(sku, serializeOverrides(sku, snap.data() || {}));
    });
  }
  return map;
}

export type ProductOverridesInput = {
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  era?: string | null;
  material?: string | null;
  origin?: string | null;
  provenance?: string | null;
  condition?: string | null;
  marks?: string | null;
  dimensions?: string | null;
  vaultLocation?: string | null;
  costOverride?: number | null;
  listPriceOverride?: number | null;
  salePriceOverride?: number | null;
  images?: string[] | null;
};

export async function saveProductOverrides(
  skuRaw: string,
  input: ProductOverridesInput,
  updatedByEmail: string,
): Promise<ProductOverrides> {
  const sku = String(skuRaw || "").trim();
  if (!sku) throw new Error("SKU is required.");
  const db = getDb();
  const ref = db.collection("salesPortalProductOverrides").doc(productOverrideDocId(sku));
  const now = new Date();

  const payload: Record<string, unknown> = {
    orgSlug: WHOLESALE_ORG_SLUG,
    sku,
    title: takeTextOrNull(input.title),
    brand: takeTextOrNull(input.brand),
    category: takeTextOrNull(input.category),
    description: takeTextOrNull(input.description),
    era: takeTextOrNull(input.era),
    material: takeTextOrNull(input.material),
    origin: takeTextOrNull(input.origin),
    provenance: takeTextOrNull(input.provenance),
    condition: takeTextOrNull(input.condition),
    marks: takeTextOrNull(input.marks),
    dimensions: takeTextOrNull(input.dimensions),
    vaultLocation: takeTextOrNull(input.vaultLocation),
    costOverride: takeNumberOrNull(input.costOverride),
    listPriceOverride: takeNumberOrNull(input.listPriceOverride),
    salePriceOverride: takeNumberOrNull(input.salePriceOverride),
    images:
      Array.isArray(input.images) && input.images.length
        ? input.images.map((u) => String(u).trim()).filter(Boolean)
        : null,
    updatedAt: now,
    updatedBy: String(updatedByEmail || ""),
    createdAt: now,
  };

  await ref.set(payload, { merge: true });
  return serializeOverrides(sku, { ...payload, createdAt: undefined });
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Upload one staff-provided product photo to Firebase Storage and return its public URL. */
export async function uploadProductImage(
  sku: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const ext = ALLOWED_IMAGE_TYPES[contentType.toLowerCase()];
  if (!ext) {
    throw new Error("Unsupported image type. Use JPEG, PNG, WEBP, or GIF.");
  }
  if (bytes.length > 15 * 1024 * 1024) {
    throw new Error("Image is too large (max 15MB).");
  }
  const cleanSku = String(sku || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "sku";
  const path = `wholesale-product-images/${cleanSku}/${Date.now()}-${randomUUID()}.${ext}`;
  const bucket = getBucket();
  const file = bucket.file(path);
  await file.save(bytes, {
    contentType,
    metadata: { cacheControl: "public, max-age=31536000" },
  });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}
