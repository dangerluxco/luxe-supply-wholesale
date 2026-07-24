// Org settings under organizations.salesPortal — thresholds, notify emails,
// company profile, structured invoicing, and feature flags.
import { unstable_cache, revalidateTag } from "next/cache";
import { getDb } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import { normalizeShippingRules, type ShippingRules } from "@/lib/shipping-rules";

/**
 * Portal feature flags are read on every staff-portal navigation (rep/layout)
 * but change rarely, so they're cached across requests (short TTL) on top of the
 * per-request org memoization. Writers call revalidateTag(PORTAL_FEATURES_TAG)
 * so an admin's toggle reflects immediately; other sessions pick it up within
 * the TTL. Only plain booleans are cached (serialization-safe).
 */
const PORTAL_FEATURES_TAG = "portal-features";

export type QuoteThresholds = {
  minItemCount: number;
  minCartTotal: number;
};

export type CompanyProfile = {
  displayName: string;
  timezone: string;
  logoUrl: string;
  brandColor: string;
};

export type InvoicingProfile = {
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  taxId: string;
  invoicePrefix: string;
  defaultTerms: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingAba: string;
  swift: string;
  remittanceEmail: string;
  /** Legacy freeform block — used as PDF fallback when structured bank fields empty. */
  paymentInstructions: string;
  /**
   * Optional notes printed after the payment/wire block (late fees, remittance tips, etc.).
   * Empty = omit the section on the PDF.
   */
  invoiceNotes: string;
  /**
   * Terms of sale / return / authenticity language printed after notes (or after payment).
   * Empty = omit the section on the PDF.
   */
  termsAndConditions: string;
  /**
   * Closing line at the bottom of every invoice PDF. Empty falls back to the default
   * Luxe thank-you copy in the PDF renderer.
   */
  footerMessage: string;
};

/** Default PDF footer when `footerMessage` is blank. */
export const DEFAULT_INVOICE_FOOTER =
  "Every piece is one of one, authenticated, and insured in transit. Thank you for collecting with Luxe Supply Co.";

export type PortalFeatures = {
  leads: boolean;
  wishlist: boolean;
  performance: boolean;
  curation: boolean;
};

const DEFAULT_FEATURES: PortalFeatures = {
  leads: true,
  wishlist: true,
  performance: true,
  curation: true,
};

function salesPortalOf(orgData: Record<string, unknown>): Record<string, unknown> {
  return (orgData.salesPortal || {}) as Record<string, unknown>;
}

export function normalizeQuoteThresholds(raw: unknown): QuoteThresholds {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let minItemCount = parseInt(String(src.minItemCount ?? ""), 10);
  let minCartTotal = Number(src.minCartTotal);
  if (!Number.isFinite(minItemCount) || minItemCount < 0) minItemCount = 0;
  if (!Number.isFinite(minCartTotal) || minCartTotal < 0) minCartTotal = 0;
  minItemCount = Math.min(Math.floor(minItemCount), 9999);
  minCartTotal = Math.min(Math.round(minCartTotal * 100) / 100, 10_000_000);
  return { minItemCount, minCartTotal };
}

export type ThresholdCheck = {
  thresholds: QuoteThresholds;
  itemCount: number;
  cartTotal: number;
  itemsOk: boolean;
  totalOk: boolean;
  met: boolean;
  message: string;
};

/**
 * Submit gate: buyer's order must meet at least one active rule (item count OR cart
 * total — either is enough when both are set). A rule with value 0 is off.
 */
export function evaluateQuoteThresholds(
  raw: unknown,
  input: { itemCount: number; cartTotal: number; pricedItemCount: number },
): ThresholdCheck {
  const t = normalizeQuoteThresholds(raw);
  const itemsOk = t.minItemCount > 0 ? input.itemCount >= t.minItemCount : false;
  const totalOk = t.minCartTotal > 0 ? input.cartTotal >= t.minCartTotal : false;
  const anyRule = t.minItemCount > 0 || t.minCartTotal > 0;
  const met = !anyRule || itemsOk || totalOk;

  let message = "";
  if (!met) {
    const fmtTotal = `$${t.minCartTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    if (t.minItemCount > 0 && t.minCartTotal > 0) {
      message = `Add at least ${t.minItemCount} item${t.minItemCount === 1 ? "" : "s"} or reach ${fmtTotal} order total to submit for processing (you have ${input.itemCount} item${input.itemCount === 1 ? "" : "s"}).`;
    } else if (t.minItemCount > 0) {
      message = `Add at least ${t.minItemCount} item${t.minItemCount === 1 ? "" : "s"} to submit for processing (you have ${input.itemCount}).`;
    } else {
      message = `Reach ${fmtTotal} order total to submit for processing.`;
    }
  }

  return {
    thresholds: t,
    itemCount: input.itemCount,
    cartTotal: input.cartTotal,
    itemsOk,
    totalOk,
    met,
    message,
  };
}

function trimStr(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

export function normalizeCompanyProfile(raw: unknown): CompanyProfile {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    displayName: trimStr(src.displayName, 120),
    timezone: trimStr(src.timezone, 80) || "America/New_York",
    logoUrl: trimStr(src.logoUrl, 500),
    brandColor: trimStr(src.brandColor, 32),
  };
}

export function normalizeInvoicingProfile(raw: unknown, legacyPayment = ""): InvoicingProfile {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    legalName: trimStr(src.legalName, 160) || "Luxe Supply Corporation",
    addressLine1: trimStr(src.addressLine1, 160),
    addressLine2: trimStr(src.addressLine2, 160),
    city: trimStr(src.city, 80),
    state: trimStr(src.state, 40),
    postalCode: trimStr(src.postalCode, 24),
    country: trimStr(src.country, 80) || "USA",
    taxId: trimStr(src.taxId, 40),
    invoicePrefix: trimStr(src.invoicePrefix, 16) || "INV",
    defaultTerms: trimStr(src.defaultTerms, 40) || "Net 30",
    bankName: trimStr(src.bankName, 120),
    accountName: trimStr(src.accountName, 160),
    accountNumber: trimStr(src.accountNumber, 80),
    routingAba: trimStr(src.routingAba, 40),
    swift: trimStr(src.swift, 40),
    remittanceEmail: trimStr(src.remittanceEmail, 160),
    paymentInstructions: trimStr(src.paymentInstructions ?? legacyPayment, 2000),
    invoiceNotes: trimStr(src.invoiceNotes, 4000),
    termsAndConditions: trimStr(src.termsAndConditions, 6000),
    footerMessage: trimStr(src.footerMessage, 500),
  };
}

export function normalizePortalFeatures(raw: unknown): PortalFeatures {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    leads: src.leads === false ? false : true,
    wishlist: src.wishlist === false ? false : true,
    performance: src.performance === false ? false : true,
    curation: src.curation === false ? false : true,
  };
}

/** Build PDF payment block from structured fields, falling back to freeform text. */
export function formatPaymentInstructions(profile: InvoicingProfile): string {
  const lines: string[] = [];
  if (profile.bankName || profile.accountName || profile.accountNumber || profile.routingAba) {
    lines.push("Please remit payment by wire or ACH to:");
    if (profile.bankName) lines.push(`Bank: ${profile.bankName}`);
    if (profile.accountName) lines.push(`Account name: ${profile.accountName}`);
    if (profile.accountNumber) lines.push(`Account #: ${profile.accountNumber}`);
    if (profile.routingAba) lines.push(`Routing / ABA: ${profile.routingAba}`);
    if (profile.swift) lines.push(`SWIFT: ${profile.swift}`);
    if (profile.remittanceEmail) lines.push(`Questions: ${profile.remittanceEmail}`);
    return lines.join("\n");
  }
  return profile.paymentInstructions.trim();
}

export async function getQuoteThresholds(): Promise<QuoteThresholds> {
  const org = await getLuxesupplyOrg();
  return normalizeQuoteThresholds(salesPortalOf(org.data).quoteThresholds);
}

/** Cart shipping methods + free-shipping comp threshold (Settings → Shipping). */
export async function getShippingRules(): Promise<ShippingRules> {
  const org = await getLuxesupplyOrg();
  return normalizeShippingRules(salesPortalOf(org.data).shippingRules);
}

export async function saveShippingRules(input: unknown): Promise<ShippingRules> {
  const next = normalizeShippingRules(input);
  // Full method objects — managers own the list (add/remove/rename) self-serve.
  await patchSalesPortal({
    shippingRules: {
      freeShippingThreshold: next.freeShippingThreshold,
      methods: next.methods.map((m) => ({
        id: m.id,
        label: m.label,
        description: m.description,
        price: m.price,
        enabled: m.enabled,
        compEligible: m.compEligible,
      })),
    },
  });
  return next;
}

export async function getCompanyProfile(): Promise<CompanyProfile> {
  const org = await getLuxesupplyOrg();
  const sp = salesPortalOf(org.data);
  const profile = normalizeCompanyProfile(sp.companyProfile);
  if (!profile.displayName) {
    profile.displayName = String(org.data.displayName || org.data.name || "Luxe Supply").trim();
  }
  return profile;
}

export async function getInvoicingProfile(): Promise<InvoicingProfile> {
  const org = await getLuxesupplyOrg();
  const sp = salesPortalOf(org.data);
  return normalizeInvoicingProfile(sp.invoicing, String(sp.paymentInstructions || ""));
}

/** Wire/payment instructions printed on branded invoice PDFs (staff-editable). */
export async function getPaymentInstructions(): Promise<string> {
  const profile = await getInvoicingProfile();
  return formatPaymentInstructions(profile);
}

const loadPortalFeatures = unstable_cache(
  async (): Promise<PortalFeatures> => {
    const org = await getLuxesupplyOrg();
    return normalizePortalFeatures(salesPortalOf(org.data).features);
  },
  ["portal-features"],
  { tags: [PORTAL_FEATURES_TAG], revalidate: 60 },
);

export async function getPortalFeatures(): Promise<PortalFeatures> {
  return loadPortalFeatures();
}

/** Extra staff-notification recipients on top of active `salesPortalStaff` accounts. */
/** Team sales goals shown on the performance screen. Meeting defaults: $500k sales / $100k GP monthly. */
export type SalesGoals = {
  monthlyRevenue: number;
  monthlyGp: number;
  weeklyRevenue: number | null;
  weeklyGp: number | null;
  /** Per-rep monthly revenue quotas, keyed by staff email (absent = no quota). */
  repQuotas: Record<string, number>;
};

const DEFAULT_SALES_GOALS: SalesGoals = {
  monthlyRevenue: 500_000,
  monthlyGp: 100_000,
  weeklyRevenue: null,
  weeklyGp: null,
  repQuotas: {},
};

export function normalizeSalesGoals(raw: unknown): SalesGoals {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const numOrNull = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const repQuotas: Record<string, number> = {};
  if (d.repQuotas && typeof d.repQuotas === "object") {
    for (const [email, v] of Object.entries(d.repQuotas as Record<string, unknown>)) {
      const key = String(email).trim().toLowerCase();
      const n = Number(v);
      if (key && Number.isFinite(n) && n > 0) repQuotas[key] = Math.round(n);
    }
  }
  return {
    monthlyRevenue: num(d.monthlyRevenue, DEFAULT_SALES_GOALS.monthlyRevenue),
    monthlyGp: num(d.monthlyGp, DEFAULT_SALES_GOALS.monthlyGp),
    weeklyRevenue: numOrNull(d.weeklyRevenue),
    weeklyGp: numOrNull(d.weeklyGp),
    repQuotas,
  };
}

export async function getSalesGoals(): Promise<SalesGoals> {
  const org = await getLuxesupplyOrg();
  return normalizeSalesGoals(salesPortalOf(org.data).salesGoals);
}

export async function saveSalesGoals(input: Partial<SalesGoals>): Promise<SalesGoals> {
  const org = await getLuxesupplyOrg();
  const current = normalizeSalesGoals(salesPortalOf(org.data).salesGoals);
  const next = normalizeSalesGoals({ ...current, ...input });
  await patchSalesPortal({ salesGoals: next });
  return next;
}

/** Org-wide standard box sizes for the pack station dropdown ("Small box 12×10×4 · 8 oz"). */
export type BoxPreset = { name: string; weight: string; l: string; w: string; h: string };

export function normalizeBoxPresets(raw: unknown): BoxPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const d = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      const s = (v: unknown) => String(v ?? "").trim().slice(0, 40);
      return { name: s(d.name), weight: s(d.weight), l: s(d.l), w: s(d.w), h: s(d.h) };
    })
    .filter((p) => p.name)
    .slice(0, 20);
}

export async function getBoxPresets(): Promise<BoxPreset[]> {
  const org = await getLuxesupplyOrg();
  return normalizeBoxPresets(salesPortalOf(org.data).boxPresets);
}

export async function saveBoxPresets(raw: unknown): Promise<BoxPreset[]> {
  const next = normalizeBoxPresets(raw);
  await patchSalesPortal({ boxPresets: next });
  return next;
}

export async function getNotifyEmails(): Promise<string[]> {
  const org = await getLuxesupplyOrg();
  const raw = salesPortalOf(org.data).notifyEmails;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

async function patchSalesPortal(patch: Record<string, unknown>): Promise<void> {
  const org = await getLuxesupplyOrg();
  const ref = getDb().collection("organizations").doc(org.id);
  const prev = salesPortalOf(org.data);
  await ref.set(
    {
      salesPortal: {
        ...prev,
        ...patch,
        updatedAt: new Date(),
      },
      updatedAt: new Date(),
    },
    { merge: true },
  );
}

export async function saveQuoteSettings(input: {
  minItemCount: number;
  minCartTotal: number;
  notifyEmails?: string[];
  paymentInstructions?: string;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    quoteThresholds: normalizeQuoteThresholds({
      minItemCount: input.minItemCount,
      minCartTotal: input.minCartTotal,
    }),
  };
  if (input.notifyEmails !== undefined) patch.notifyEmails = input.notifyEmails;
  if (input.paymentInstructions !== undefined) {
    patch.paymentInstructions = String(input.paymentInstructions).trim().slice(0, 2000);
  }
  await patchSalesPortal(patch);
}

export async function saveCompanyProfile(input: Partial<CompanyProfile>): Promise<CompanyProfile> {
  const current = await getCompanyProfile();
  const next = normalizeCompanyProfile({ ...current, ...input });
  await patchSalesPortal({ companyProfile: next });
  return next;
}

export async function saveInvoicingProfile(
  input: Partial<InvoicingProfile>,
): Promise<InvoicingProfile> {
  const current = await getInvoicingProfile();
  const next = normalizeInvoicingProfile({ ...current, ...input });
  // Keep legacy field in sync for older readers.
  await patchSalesPortal({
    invoicing: next,
    paymentInstructions: formatPaymentInstructions(next) || next.paymentInstructions,
  });
  return next;
}

export async function saveNotifyEmails(emails: string[]): Promise<string[]> {
  const cleaned = emails
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  await patchSalesPortal({ notifyEmails: cleaned });
  return cleaned;
}

export async function savePortalFeatures(input: Partial<PortalFeatures>): Promise<PortalFeatures> {
  // Read the merge base fresh from the org doc (per-request memoized) rather than
  // the cross-request cache, so a rapid second toggle can't clobber a just-saved
  // change with stale data.
  const org = await getLuxesupplyOrg();
  const current = normalizePortalFeatures(salesPortalOf(org.data).features);
  const next = normalizePortalFeatures({ ...DEFAULT_FEATURES, ...current, ...input });
  await patchSalesPortal({ features: next });
  revalidateTag(PORTAL_FEATURES_TAG);
  return next;
}
