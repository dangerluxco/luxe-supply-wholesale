// Shipping rules — manager-configurable cart shipping methods + the free-shipping
// comp threshold (Settings → Shipping, stored at organizations.*.salesPortal.shippingRules).
//
// Pure logic only: no Firestore imports, so client components (cart checkout)
// share the exact evaluation the server runs at submit and invoice generation.
// The stored method list is authoritative — managers add/remove/rename methods
// entirely self-serve. SHIPPING_OPTIONS is only the first-run seed (and the
// label fallback for method ids saved before this feature existed).
import { DEFAULT_SHIPPING_METHOD_ID, SHIPPING_OPTIONS } from "@/lib/constants";

export type ShippingMethodRule = {
  id: string;
  label: string;
  description: string;
  /** Whole-dollar fee charged when the order doesn't qualify for a comp. */
  price: number;
  /** Whether buyers see this method at checkout. */
  enabled: boolean;
  /** Whether the free-shipping threshold comps this method. */
  compEligible: boolean;
};

export type ShippingRules = {
  /** Merchandise subtotal (pre-shipping) at/above which eligible methods ship free. 0 = off. */
  freeShippingThreshold: number;
  methods: ShippingMethodRule[];
};

/** Comp snapshot stored on quotes/invoices so staff can see why shipping is $0. */
export type ShippingComp = {
  applied: true;
  /** Threshold in force when the comp was applied. */
  threshold: number;
  /** The fee the buyer would have paid — restored if the order later drops below threshold. */
  baseFee: number;
};

export const DEFAULT_FREE_SHIPPING_THRESHOLD = 10_000;

/** Paid freight tiers are comped by default; white glove stays paid, pickup is already free. */
const DEFAULT_COMP_ELIGIBLE = new Set<string>(["standard", "insured"]);

export function defaultShippingRules(): ShippingRules {
  return {
    freeShippingThreshold: DEFAULT_FREE_SHIPPING_THRESHOLD,
    methods: SHIPPING_OPTIONS.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description,
      price: o.price,
      enabled: true,
      compEligible: DEFAULT_COMP_ELIGIBLE.has(o.id),
    })),
  };
}

function clampMoney(v: unknown, fallback: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.round(n), max);
}

export const MAX_SHIPPING_METHODS = 12;

function slugifyMethodId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "method";
}

/**
 * The stored method list is the source of truth (add/remove/rename all live in
 * settings). Two stored shapes are accepted: full objects (current), and the
 * earlier overlay format ({id, price, enabled, compEligible} without a label),
 * which is hydrated from the SHIPPING_OPTIONS catalog. New methods without an
 * id get a slug from their label. An empty/missing list seeds the defaults.
 */
export function normalizeShippingRules(raw: unknown): ShippingRules {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const catalog = new Map(defaultShippingRules().methods.map((m) => [m.id, m]));
  const methods: ShippingMethodRule[] = [];
  const seen = new Set<string>();

  if (Array.isArray(src.methods)) {
    for (const entry of (src.methods as Array<Record<string, unknown>>).slice(
      0,
      MAX_SHIPPING_METHODS,
    )) {
      if (!entry || typeof entry !== "object") continue;
      const label = String(entry.label ?? "").trim().slice(0, 80);
      const idRaw = String(entry.id ?? "").trim().slice(0, 48);
      const base = idRaw ? catalog.get(idRaw) : undefined;
      if (!label && !base) continue; // nothing displayable
      let id = idRaw || slugifyMethodId(label);
      if (seen.has(id)) {
        let n = 2;
        while (seen.has(`${id}_${n}`)) n++;
        id = `${id}_${n}`;
      }
      seen.add(id);
      methods.push({
        id,
        label: label || base!.label,
        description:
          entry.description !== undefined
            ? String(entry.description).trim().slice(0, 160)
            : base?.description ?? "",
        price: clampMoney(entry.price, base?.price ?? 0, 1_000_000),
        enabled: entry.enabled === false ? false : true,
        compEligible:
          entry.compEligible === undefined ? base?.compEligible ?? false : entry.compEligible === true,
      });
    }
  }

  return {
    freeShippingThreshold:
      src.freeShippingThreshold === undefined
        ? DEFAULT_FREE_SHIPPING_THRESHOLD
        : clampMoney(src.freeShippingThreshold, DEFAULT_FREE_SHIPPING_THRESHOLD, 10_000_000),
    methods: methods.length ? methods : defaultShippingRules().methods,
  };
}

/** Methods buyers can pick at checkout. All-disabled is a misconfig — show everything. */
export function enabledShippingMethods(rules: ShippingRules): ShippingMethodRule[] {
  const enabled = rules.methods.filter((m) => m.enabled);
  return enabled.length ? enabled : rules.methods;
}

export function defaultShippingMethodId(rules: ShippingRules): string {
  const methods = enabledShippingMethods(rules);
  const preferred = methods.find((m) => m.id === DEFAULT_SHIPPING_METHOD_ID);
  return (preferred ?? methods[0]!).id;
}

/** Resolve a buyer-submitted method id against the enabled set (fallback: default). */
export function resolveShippingMethodRule(
  rules: ShippingRules,
  id?: string | null,
): ShippingMethodRule {
  const methods = enabledShippingMethods(rules);
  return methods.find((m) => m.id === id) ?? methods.find((m) => m.id === defaultShippingMethodId(rules))!;
}

export type ShippingCharge = {
  methodId: string;
  label: string;
  /** The method's configured fee. */
  basePrice: number;
  /** What the buyer is actually charged (0 when comped). */
  price: number;
  comped: boolean;
  threshold: number;
};

/** The one comp rule: merchandise subtotal ≥ threshold ⇒ eligible methods ship free. */
export function evaluateShippingCharge(
  rules: ShippingRules,
  methodId: string,
  subtotal: number,
): ShippingCharge {
  const method = resolveShippingMethodRule(rules, methodId);
  const threshold = rules.freeShippingThreshold;
  const comped = threshold > 0 && method.compEligible && subtotal >= threshold;
  return {
    methodId: method.id,
    label: method.label,
    basePrice: method.price,
    price: comped ? 0 : method.price,
    comped,
    threshold,
  };
}

/** Whether the comp threshold is in play at all (for checkout progress messaging). */
export function compThresholdActive(rules: ShippingRules): boolean {
  return (
    rules.freeShippingThreshold > 0 && enabledShippingMethods(rules).some((m) => m.compEligible)
  );
}

/**
 * Invoice-generation pass: staff may have added/removed lines since submit, so the
 * comp is re-checked in both directions against the invoice subtotal. The buyer's
 * agreed fee is never repriced — qualifying zeroes it, disqualifying restores the
 * fee they saw at checkout (not today's configured price).
 */
export function reevaluateInvoiceShipping(
  rules: ShippingRules,
  quote: { shipping: number; shippingMethodId: string; shippingComp: ShippingComp | null },
  subtotal: number,
): { shipping: number; comp: ShippingComp | null } {
  const baseFee = quote.shippingComp
    ? Math.max(0, Math.round(quote.shippingComp.baseFee))
    : Math.max(0, Math.round(Number(quote.shipping) || 0));
  const method = rules.methods.find((m) => m.id === quote.shippingMethodId);
  const threshold = rules.freeShippingThreshold;
  const qualifies = threshold > 0 && !!method?.compEligible && subtotal >= threshold;
  if (qualifies) return { shipping: 0, comp: { applied: true, threshold, baseFee } };
  return { shipping: baseFee, comp: null };
}

/**
 * Display label for a saved method id (buyer default-method preferences,
 * old order requests). Falls back to the code catalog for ids that predate
 * self-serve methods, then null when the method was removed entirely.
 */
export function shippingMethodLabel(rules: ShippingRules, id?: string | null): string | null {
  if (!id) return null;
  const m = rules.methods.find((x) => x.id === id);
  if (m) return m.label;
  const legacy = SHIPPING_OPTIONS.find((o) => o.id === id);
  return legacy ? legacy.label : null;
}

/** Parse a stored comp snapshot (Firestore doc field) back into a ShippingComp. */
export function parseShippingComp(raw: unknown): ShippingComp | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.applied !== true) return null;
  return {
    applied: true,
    threshold: Math.max(0, Math.round(Number(c.threshold) || 0)),
    baseFee: Math.max(0, Math.round(Number(c.baseFee) || 0)),
  };
}
