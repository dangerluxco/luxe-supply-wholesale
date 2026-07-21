// Shared status/role constants — SQLite has no enums, so these are the source of truth.

export const ROLE = {
  BUYER: "BUYER",
  REP: "REP",
  MANAGER: "MANAGER",
  FULFILLMENT: "FULFILLMENT",
} as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

export const PRODUCT_STATUS = {
  AVAILABLE: "AVAILABLE",
  ON_HOLD: "ON_HOLD",
  SOLD: "SOLD",
  BUNDLED: "BUNDLED",
} as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

export const INVOICE_STATUS = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
} as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const ORDER_STATUS = {
  CART: "CART",
  TO_PICK: "TO_PICK",
  PICKING: "PICKING",
  PACKING: "PACKING",
  SHIPPED: "SHIPPED",
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const LEAD_STATUS = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  QUALIFYING: "QUALIFYING",
  WON: "WON",
  LOST: "LOST",
} as const;
export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

export const CALL_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  RESCHEDULE: "RESCHEDULE",
} as const;
export type CallStatus = (typeof CALL_STATUS)[keyof typeof CALL_STATUS];

export const DISCOUNT_TYPE = {
  PERCENT: "PERCENT",
  FLAT: "FLAT",
} as const;

export const BUNDLE_STATUS = {
  DRAFT: "DRAFT",
  LIVE: "LIVE",
} as const;

// Business rules
export const MIN_ORDER_VALUE = 2500;
/** Prisma/legacy cart hold length in hours (aligned with HOLD_TTL_MS = 7 days). */
export const HOLD_HOURS = 7 * 24;
export const INSURED_SHIPPING = 185;

/**
 * Buyer-selectable shipping methods on the wholesale cart.
 * Prices are placeholders — update this list anytime; existing order requests
 * keep whatever method/price was saved at submit.
 */
export const SHIPPING_OPTIONS = [
  {
    id: "standard",
    label: "Standard ground",
    price: 95,
    description: "Insured ground freight · 5–10 business days",
  },
  {
    id: "insured",
    label: "Insured express",
    price: INSURED_SHIPPING,
    description: "Fully insured · 3–5 business days",
  },
  {
    id: "white_glove",
    label: "White glove",
    price: 450,
    description: "White-glove delivery · appointment required",
  },
  {
    id: "pickup",
    label: "Local pickup",
    price: 0,
    description: "Buyer arranges pickup · no shipping charge",
  },
] as const;

export type ShippingOptionId = (typeof SHIPPING_OPTIONS)[number]["id"];
export const DEFAULT_SHIPPING_METHOD_ID: ShippingOptionId = "insured";

export function resolveShippingOption(id?: string | null) {
  const match = SHIPPING_OPTIONS.find((o) => o.id === id);
  return match ?? SHIPPING_OPTIONS.find((o) => o.id === DEFAULT_SHIPPING_METHOD_ID)!;
}

/** Soft-hold TTL for cart and invoice-request holds alike. */
export const HOLD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Soft-hold while an invoice request is pending (aligned with request timeout). */
// Do not redeclare HOLD_QUOTE_MS elsewhere in this file.
export const HOLD_QUOTE_MS = HOLD_TTL_MS;
/** Default order hold limits for new buyers (staff can raise per client). */
export const DEFAULT_MAX_CART_ITEMS = 20;
export const DEFAULT_MAX_CART_VALUE = 10000;
/** Default % off for suggested-lot builder preview. */
export const BUNDLE_DEFAULT_DISCOUNT_PERCENT = 5;
/** Active suggested lots auto-archive after this many days so SKUs return to the catalog. */
export const BUNDLE_AUTO_EXPIRE_DAYS = 14;

// Tier thresholds (trailing-12-month spend)
export function tierForSpend(spend: number): 1 | 2 | 3 {
  if (spend >= 50000) return 1;
  if (spend >= 10000) return 2;
  return 3;
}

export const DEFAULT_PACKING_CHECKLIST = [
  { label: "Condition photographed before wrap", done: false },
  { label: "Acid-free tissue + custom crate", done: false },
  { label: "Certificate of provenance enclosed", done: false },
  { label: "Insurance seal applied", done: false },
];

export const CARRIERS = ["FERRARI GRP", "MALCA-AMIT", "BRINK'S FINE ART"];

// Firestore salesPortalQuotes statuses. Kept as "quote" internally (collection
// name + these values) to avoid a data migration — buyer/staff-facing copy now
// calls this an "order request" (see BRIDGE.md).
export const QUOTE_STATUSES = [
  "open",
  "contacted",
  "quoted",
  "closed",
  "declined",
  "timed_out",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Buyer-facing (frontend portal) labels for order-request statuses. A fresh
 * request sits in "Pending Approval" until the sales team acts on it — staff
 * keep their own pipeline vocabulary (Open/Contacted/Invoiced) internally. */
export const BUYER_QUOTE_STATUS_LABEL: Record<string, string> = {
  open: "Pending approval",
  contacted: "Seller contacted",
  quoted: "Invoice sent",
  closed: "Closed",
  declined: "Declined",
  timed_out: "Timed out",
};

/** Pending invoice requests auto-timeout after this many days. */
export const INVOICE_REQUEST_TIMEOUT_DAYS = 7;

// Formal invoices (Firestore `salesPortalInvoices`) generated by staff from an
// invoice request. Reuses the same status vocabulary as the legacy Prisma
// InvoiceBadge (DRAFT/SENT/PAID/OVERDUE) so badge styling stays consistent —
// OVERDUE is computed at render time (SENT + past due date), never stored.
export const FIRESTORE_INVOICE_STATUS = {
  SENT: "SENT",
  PAID: "PAID",
} as const;

export const FULFILLMENT_STATUS = {
  UNFULFILLED: "UNFULFILLED",
  SHIPPED: "SHIPPED",
} as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUS)[keyof typeof FULFILLMENT_STATUS];

export const INVOICE_TERMS = "Net 30";

/** Options for a buyer's account-level payment terms (staff "Edit account" panel). */
export const PAYMENT_TERMS_OPTIONS = ["Due on receipt", "Net 15", "Net 30", "Net 45", "Net 60"];

/**
 * Payment tiers — a per-buyer trust level that carries default payment terms.
 * Picking a tier in "Edit account" pre-fills the terms (still individually
 * overridable); invoices generated for the buyer use whatever terms their
 * account carries. Tier numbering matches the existing TierBadge styling
 * (1 = solid gold, 2 = outline gold, 3 = gray).
 */
export const PAYMENT_TIERS = [
  { tier: 1, label: "Tier 1 · Established", defaultTerms: "Net 60" },
  { tier: 2, label: "Tier 2 · Preferred", defaultTerms: "Net 30" },
  { tier: 3, label: "Tier 3 · Standard", defaultTerms: "Due on receipt" },
] as const;
export const DEFAULT_PAYMENT_TIER = 3;

/** "Net 30" → 30, "Due on receipt" → 0. Unknown/empty strings fall back to Net-30. */
export function netDaysFromTerms(terms: string): number {
  const t = String(terms || "").trim().toLowerCase();
  if (t === "due on receipt") return 0;
  const m = t.match(/net\s*(\d{1,3})/);
  return m ? Number(m[1]) : 30;
}

/** Options for a buyer's preferred payment method. */
export const PREFERRED_PAYMENT_OPTIONS = ["ACH transfer", "Wire transfer", "Credit card", "Check"];
