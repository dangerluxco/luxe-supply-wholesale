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
export const HOLD_HOURS = 48;
export const INSURED_SHIPPING = 185;

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
// calls this an "invoice request" (see BRIDGE.md).
export const QUOTE_STATUSES = ["open", "contacted", "quoted", "closed", "declined"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
