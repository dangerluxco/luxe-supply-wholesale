// Shared profit-margin math and display helpers — single source of truth so
// the catalog editor, product edit page, and bundle builder all agree.
//
// Formula: Profit $ = Price - Cost, Profit % = (Price - Cost) / Price × 100
// (percent is relative to the selling price, not the cost basis).

import { money } from "@/lib/format";

/** At/above this percent, margin reads as healthy ("good" — green). */
export const MARGIN_TARGET_PERCENT = 20;
/** Below target but non-negative reads as "low" (yellow); negative reads as "negative" (red). */
export const MARGIN_LOW_PERCENT = 0;

export type Margin = {
  amount: number | null;
  percent: number | null;
};

export type MarginTone = "good" | "low" | "negative" | "unknown";

export function marginFor(cost: number | null, price: number | null): Margin {
  if (cost == null || price == null || !Number.isFinite(cost) || !Number.isFinite(price)) {
    return { amount: null, percent: null };
  }
  const amount = price - cost;
  const percent = price > 0 ? Math.round((amount / price) * 100) : null;
  return { amount, percent };
}

/** Classifies a margin percent for consistent green/yellow/red treatment across the app. */
export function marginTone(percent: number | null): MarginTone {
  if (percent == null) return "unknown";
  if (percent < MARGIN_LOW_PERCENT) return "negative";
  if (percent < MARGIN_TARGET_PERCENT) return "low";
  return "good";
}

/** Tailwind text-color class for a margin tone (matches the app's existing danger/success palette). */
export function marginToneClass(tone: MarginTone): string {
  switch (tone) {
    case "good":
      return "text-[#4E9A6A]";
    case "low":
      return "text-[#B08D3E]";
    case "negative":
      return "text-danger";
    default:
      return "text-secondary";
  }
}

/** "$500 (25%)" — the standard staff-facing margin label. */
export function formatMargin(margin: Margin): string {
  if (margin.amount == null || margin.percent == null) return "—";
  return `${money(margin.amount)} (${margin.percent}%)`;
}

/**
 * Buyer-facing comp-average line — a selling tool, so it only renders when the
 * comp genuinely flatters the asking price (comps at/below asking argue AGAINST
 * the deal and used to be shown anyway). Returns e.g. "38% below comp avg
 * $3,713", or null when the comparison is unfavorable/unknown. Staff surfaces
 * should keep showing the raw comp regardless — they need the anchor either way.
 */
export function favorableCompLine(
  price: number | null,
  compAvg: number | null,
): string | null {
  if (
    price == null ||
    compAvg == null ||
    !Number.isFinite(price) ||
    !Number.isFinite(compAvg) ||
    price <= 0
  ) {
    return null;
  }
  const belowPct = Math.round(((compAvg - price) / compAvg) * 100);
  // Under 5% below comp isn't a story worth telling — skip marginal cases too.
  if (belowPct < 5) return null;
  return `${belowPct}% below comp avg ${money(Math.round(compAvg))}`;
}
