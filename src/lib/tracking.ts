/** Carrier tracking URL builder — shared by invoice pages and the shipped email. */

const CARRIER_URLS: Array<{ match: RegExp; url: (tn: string) => string }> = [
  { match: /ups/i, url: (tn) => `https://www.ups.com/track?tracknum=${encodeURIComponent(tn)}` },
  { match: /fedex/i, url: (tn) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}` },
  { match: /usps/i, url: (tn) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tn)}` },
  { match: /dhl/i, url: (tn) => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(tn)}` },
];

/**
 * Buyer-facing carrier name. Purchased labels store ShipEngine carrier_codes
 * ("stamps_com", "dhl_express") — map those back to household names; manual
 * entries ("UPS") pass through.
 */
export function friendlyCarrierName(carrier: string | null): string {
  const c = (carrier || "").trim();
  if (!c) return "";
  if (/stamps|usps/i.test(c)) return "USPS";
  if (/ups/i.test(c)) return "UPS";
  if (/fedex/i.test(c)) return "FedEx";
  if (/dhl/i.test(c)) return "DHL";
  return c.replace(/_/g, " ").toUpperCase();
}

/**
 * Best-effort tracking link for a carrier + tracking number. Returns null when
 * either is missing or the carrier isn't recognized — callers fall back to
 * plain text.
 */
export function trackingUrlFor(carrier: string | null, trackingNumber: string | null): string | null {
  const tn = (trackingNumber || "").trim();
  const c = friendlyCarrierName(carrier);
  if (!tn || !c) return null;
  const hit = CARRIER_URLS.find((e) => e.match.test(c));
  return hit ? hit.url(tn) : null;
}
