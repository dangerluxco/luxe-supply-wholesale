import { defaultPriceFromCost, getStaffProductBaseBySku } from "./catalog";
import { marginFor } from "@/lib/pricing";
import {
  getProductOverrides,
  saveProductOverrides,
  type ProductOverridesInput,
} from "./productOverrides";

/**
 * Full staff-facing view of one SKU for the product edit page: the live
 * inventory facts, any staff overrides on top of them, and the *effective*
 * value actually used (override if set, else the resolved inventory value).
 */
export type ProductDetailView = {
  sku: string;
  inDb: boolean;
  soldOut: boolean;

  title: string;
  titleOverridden: boolean;
  brand: string;
  brandOverridden: boolean;

  category: string;
  description: string;
  origin: string;
  provenance: string;
  marks: string;
  dimensions: string;
  vaultLocation: string;

  era: string;
  eraOverridden: boolean;
  material: string;
  materialOverridden: boolean;
  condition: string;
  conditionOverridden: boolean;

  /** Raw inventory cost basis, before any staff override. */
  inventoryCost: number | null;
  cost: number | null;
  costOverridden: boolean;

  /** Regular/full price. Defaults to cost / 0.8 when not overridden. */
  listPrice: number | null;
  listPriceOverridden: boolean;
  /** Optional promotional price; when set, this is the effective selling price. */
  salePrice: number | null;

  /** The price actually used for margin math: salePrice if set, else listPrice. */
  effectivePrice: number | null;
  marginAmount: number | null;
  marginPercent: number | null;

  images: string[];
  imagesOverridden: boolean;

  updatedAt: string | null;
  updatedBy: string;
};

export async function getProductDetailView(skuRaw: string): Promise<ProductDetailView | null> {
  const sku = String(skuRaw || "").trim();
  if (!sku) return null;

  const [base, overrides] = await Promise.all([
    getStaffProductBaseBySku(sku),
    getProductOverrides(sku),
  ]);
  if (!base && !overrides.updatedAt) return null;

  const resolvedSku = base?.sku || overrides.sku || sku;
  const inventoryCost = base?.cost ?? null;
  const cost = overrides.costOverride ?? inventoryCost;
  const defaultListPrice = defaultPriceFromCost(cost);
  const listPrice = overrides.listPriceOverride ?? defaultListPrice;
  const salePrice = overrides.salePriceOverride ?? null;
  const effectivePrice = salePrice ?? listPrice;
  const margin = marginFor(cost, effectivePrice);
  const images = overrides.images && overrides.images.length ? overrides.images : base?.imageUrls || [];

  return {
    sku: resolvedSku,
    inDb: !!base?.inDb,
    soldOut: !!base?.soldOut,

    title: overrides.title || base?.title || resolvedSku,
    titleOverridden: !!overrides.title,
    brand: overrides.brand || base?.brand || "",
    brandOverridden: !!overrides.brand,

    category: overrides.category || "",
    description: overrides.description || "",
    origin: overrides.origin || "",
    provenance: overrides.provenance || "",
    marks: overrides.marks || "",
    dimensions: overrides.dimensions || "",
    vaultLocation: overrides.vaultLocation || "",

    era: overrides.era || base?.era || "",
    eraOverridden: !!overrides.era,
    material: overrides.material || base?.material || "",
    materialOverridden: !!overrides.material,
    condition: overrides.condition || base?.condition || "",
    conditionOverridden: !!overrides.condition,

    inventoryCost,
    cost,
    costOverridden: overrides.costOverride != null,

    listPrice,
    listPriceOverridden: overrides.listPriceOverride != null,
    salePrice,

    effectivePrice,
    marginAmount: margin.amount,
    marginPercent: margin.percent,

    images,
    imagesOverridden: !!(overrides.images && overrides.images.length),

    updatedAt: overrides.updatedAt,
    updatedBy: overrides.updatedBy,
  };
}

export type SaveProductDetailsInput = ProductOverridesInput;

export async function saveProductDetails(
  sku: string,
  input: SaveProductDetailsInput,
  updatedByEmail: string,
): Promise<ProductDetailView | null> {
  await saveProductOverrides(sku, input, updatedByEmail);
  return getProductDetailView(sku);
}
