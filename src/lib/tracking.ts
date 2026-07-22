/** Carrier tracking URL builder — shared by invoice pages and the shipped email. */

const CARRIER_URLS: Array<{ match: RegExp; url: (tn: string) => string }> = [
  { match: /ups/i, url: (tn) => `https://www.ups.com/track?tracknum=${encodeURIComponent(tn)}` },
  { match: /fedex/i, url: (tn) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}` },
  { match: /usps/i, url: (tn) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tn)}` },
  { match: /dhl/i, url: (tn) => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(tn)}` },
];

/**
 * Best-effort tracking link for a carrier + tracking number. Returns null when
 * either is missing or the carrier isn't recognized — callers fall back to
 * plain text.
 */
export function trackingUrlFor(carrier: string | null, trackingNumber: string | null): string | null {
  const tn = (trackingNumber || "").trim();
  const c = (carrier || "").trim();
  if (!tn || !c) return null;
  const hit = CARRIER_URLS.find((e) => e.match.test(c));
  return hit ? hit.url(tn) : null;
}
