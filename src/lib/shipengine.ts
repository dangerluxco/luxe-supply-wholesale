import "server-only";
import { getInvoicingProfile } from "@/lib/firestore/settings";

/**
 * Minimal ShipEngine REST client (no SDK). Env-gated on SHIPENGINE_API_KEY —
 * a sandbox key (TEST_...) works end-to-end with test labels, so the flow can
 * be exercised before carriers/billing are live. Without the key, the pack
 * station simply keeps its manual carrier/tracking inputs.
 *
 * Ship-from = the company address from Settings → Invoicing (legalName +
 * address block); SHIPENGINE_FROM_PHONE overrides the contact phone.
 */

const BASE = "https://api.shipengine.com/v1";

export function shipEngineConfigured(): boolean {
  return !!String(process.env.SHIPENGINE_API_KEY || "").trim();
}

function headers(): Record<string, string> {
  return {
    "API-Key": String(process.env.SHIPENGINE_API_KEY || "").trim(),
    "Content-Type": "application/json",
  };
}

export type ShipTo = {
  name: string;
  company?: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type Parcel = {
  weightOz: number;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
};

export type RateQuote = {
  rateId: string;
  carrier: string;
  service: string;
  serviceCode: string;
  amount: number;
  currency: string;
  deliveryDays: number | null;
};

async function shipFromAddress() {
  const inv = await getInvoicingProfile();
  if (!inv.addressLine1 || !inv.city || !inv.state || !inv.postalCode) {
    throw new Error(
      "Ship-from address missing — fill in the company address under Settings → Invoicing first.",
    );
  }
  return {
    name: inv.legalName || "Luxe Supply Co.",
    phone: String(process.env.SHIPENGINE_FROM_PHONE || "555-555-5555"),
    address_line1: inv.addressLine1,
    address_line2: inv.addressLine2 || undefined,
    city_locality: inv.city,
    state_province: inv.state,
    postal_code: inv.postalCode,
    country_code: (inv.country || "US").slice(0, 2).toUpperCase() || "US",
  };
}

function toApiAddress(to: ShipTo) {
  return {
    name: to.name,
    company_name: to.company || undefined,
    phone: to.phone || String(process.env.SHIPENGINE_FROM_PHONE || "555-555-5555"),
    address_line1: to.addressLine1,
    address_line2: to.addressLine2 || undefined,
    city_locality: to.city,
    state_province: to.state,
    postal_code: to.postalCode,
    country_code: (to.country || "US").slice(0, 2).toUpperCase() || "US",
  };
}

function toApiPackage(parcel: Parcel) {
  const pkg: Record<string, unknown> = {
    weight: { value: Math.max(1, Math.round(parcel.weightOz)), unit: "ounce" },
  };
  if (parcel.lengthIn && parcel.widthIn && parcel.heightIn) {
    pkg.dimensions = {
      unit: "inch",
      length: parcel.lengthIn,
      width: parcel.widthIn,
      height: parcel.heightIn,
    };
  }
  return pkg;
}

async function seFetch(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errs = Array.isArray(data.errors) ? (data.errors as Array<Record<string, unknown>>) : [];
    const msg = errs.map((e) => String(e.message || "")).filter(Boolean).join("; ");
    throw new Error(msg || `ShipEngine error ${res.status}`);
  }
  return data;
}

/** Connected carrier ids — required by /rates (empty list quotes nothing). Cached per instance. */
let carrierIdsCache: { ids: string[]; at: number } | null = null;
async function connectedCarrierIds(): Promise<string[]> {
  if (carrierIdsCache && Date.now() - carrierIdsCache.at < 10 * 60_000) return carrierIdsCache.ids;
  const res = await fetch(`${BASE}/carriers`, { headers: headers() });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error("Could not list ShipEngine carriers.");
  const ids = (Array.isArray(data.carriers) ? (data.carriers as Array<Record<string, unknown>>) : [])
    .filter((c) => !c.disabled_by_billing_plan)
    .map((c) => String(c.carrier_id || ""))
    .filter(Boolean);
  carrierIdsCache = { ids, at: Date.now() };
  return ids;
}

/** Rate-shop a box across all connected carriers. */
export async function getRates(to: ShipTo, parcel: Parcel): Promise<RateQuote[]> {
  const ship_from = await shipFromAddress();
  const carrier_ids = await connectedCarrierIds();
  if (!carrier_ids.length) {
    throw new Error("No carriers connected on the ShipEngine account yet.");
  }
  const data = await seFetch("/rates", {
    rate_options: { carrier_ids },
    shipment: {
      ship_to: toApiAddress(to),
      ship_from,
      packages: [toApiPackage(parcel)],
    },
  });
  const rr = (data.rate_response || {}) as Record<string, unknown>;
  const rates = Array.isArray(rr.rates) ? (rr.rates as Array<Record<string, unknown>>) : [];
  return rates
    .map((r) => {
      const amt = (r.shipping_amount || {}) as Record<string, unknown>;
      return {
        rateId: String(r.rate_id || ""),
        carrier: String(r.carrier_friendly_name || r.carrier_code || ""),
        service: String(r.service_type || r.service_code || ""),
        serviceCode: String(r.service_code || ""),
        amount: Number(amt.amount) || 0,
        currency: String(amt.currency || "usd").toUpperCase(),
        deliveryDays: Number.isFinite(Number(r.delivery_days)) ? Number(r.delivery_days) : null,
      };
    })
    .filter((r) => r.rateId)
    .sort((a, b) => a.amount - b.amount)
    // Carriers return package-type variants of the same service — keep the cheapest per service.
    .filter(
      (r, i, arr) => arr.findIndex((x) => x.serviceCode === r.serviceCode) === i,
    );
}

export type PurchasedLabel = {
  labelId: string;
  trackingNumber: string;
  carrier: string;
  service: string;
  cost: number;
  pdfUrl: string;
  zplUrl: string;
};

// ---------------------------------------------------------------------------
// Live tracking — buyer-facing status, ETA, and event timeline.
// ---------------------------------------------------------------------------

export type TrackingEvent = {
  at: string | null;
  description: string;
  location: string;
};

export type TrackingInfo = {
  statusCode: string;
  statusDescription: string;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  events: TrackingEvent[];
};

/**
 * Map a stored carrier value (ShipEngine carrier_code for purchased labels,
 * or a free-text name like "UPS" typed during manual entry) to a tracking-API
 * carrier_code. Returns null when unrecognized — callers skip the live fetch
 * and fall back to the plain carrier link.
 */
export function trackingCarrierCode(carrier: string | null): string | null {
  const c = String(carrier || "").trim().toLowerCase();
  if (!c) return null;
  if (c.includes("stamps") || c.includes("usps")) return "stamps_com";
  if (c.includes("ups")) return "ups";
  if (c.includes("fedex")) return "fedex";
  if (c.includes("dhl")) return "dhl_express";
  // Already a carrier_code (snake_case from a purchased label) — pass through.
  if (/^[a-z0-9_]+$/.test(c)) return c;
  return null;
}

function parseTracking(data: Record<string, unknown>): TrackingInfo {
  const rawEvents = Array.isArray(data.events)
    ? (data.events as Array<Record<string, unknown>>)
    : [];
  return {
    statusCode: String(data.status_code || ""),
    statusDescription: String(data.status_description || ""),
    estimatedDelivery: data.estimated_delivery_date ? String(data.estimated_delivery_date) : null,
    actualDelivery: data.actual_delivery_date ? String(data.actual_delivery_date) : null,
    events: rawEvents
      .map((e) => ({
        at: e.occurred_at ? String(e.occurred_at) : null,
        description: String(e.description || e.carrier_status_description || ""),
        location: [e.city_locality, e.state_province]
          .map((v) => String(v || "").trim())
          .filter(Boolean)
          .join(", "),
      }))
      .filter((e) => e.description),
  };
}

// Per-instance cache so a burst of buyer page views doesn't hammer the API.
const trackingCache = new Map<string, { info: TrackingInfo | null; at: number }>();
const TRACKING_TTL_MS = 5 * 60_000;

async function seGet(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/**
 * Best-effort live tracking for a box. Prefers the label id (works for every
 * label we purchased); falls back to carrier_code + tracking number, which also
 * covers manually entered UPS/FedEx/USPS numbers. Never throws — returns null
 * when the key is missing, the carrier is unknown, or the API has nothing yet.
 */
export async function getTrackingInfo(opts: {
  labelId?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
}): Promise<TrackingInfo | null> {
  if (!shipEngineConfigured()) return null;
  const key = opts.labelId || `${opts.carrier}:${opts.trackingNumber}`;
  const hit = trackingCache.get(key);
  if (hit && Date.now() - hit.at < TRACKING_TTL_MS) return hit.info;

  let info: TrackingInfo | null = null;
  try {
    let data: Record<string, unknown> | null = null;
    if (opts.labelId) {
      data = await seGet(`/labels/${encodeURIComponent(opts.labelId)}/track`);
    }
    if (!data) {
      const code = trackingCarrierCode(opts.carrier || null);
      const tn = String(opts.trackingNumber || "").trim();
      if (code && tn) {
        data = await seGet(
          `/tracking?carrier_code=${encodeURIComponent(code)}&tracking_number=${encodeURIComponent(tn)}`,
        );
      }
    }
    if (data) {
      const parsed = parseTracking(data);
      // "Unknown" with no events means the carrier has nothing yet — treat as absent.
      info = parsed.statusCode && parsed.statusCode !== "UN" ? parsed : parsed.events.length ? parsed : null;
    }
  } catch {
    info = null;
  }
  trackingCache.set(key, { info, at: Date.now() });
  return info;
}

/** Buy a label from a previously quoted rate. */
export async function purchaseLabelFromRate(rateId: string): Promise<PurchasedLabel> {
  const data = await seFetch(`/labels/rates/${encodeURIComponent(rateId)}`, {
    label_format: "pdf",
    label_layout: "4x6",
  });
  const dl = (data.label_download || {}) as Record<string, unknown>;
  const cost = (data.shipment_cost || {}) as Record<string, unknown>;
  return {
    labelId: String(data.label_id || ""),
    trackingNumber: String(data.tracking_number || ""),
    carrier: String(data.carrier_code || ""),
    service: String(data.service_code || ""),
    cost: Number(cost.amount) || 0,
    pdfUrl: String(dl.pdf || dl.href || ""),
    zplUrl: String(dl.zpl || ""),
  };
}
