// Invoice-request submission thresholds + staff notification emails.
// Stored on the LuxeSupply `organizations` doc under `salesPortal.quoteThresholds` /
// `salesPortal.notifyEmails` — same document `catalogSelection` lives on (see catalog.ts) —
// mirrors the legacy Cloud Functions shape (functions/salesPortal.js normalizeQuoteThresholds /
// evaluateQuoteThresholds) so existing org docs "just work" if they already have this field.
import { getDb } from "./admin";
import { getLuxesupplyOrg } from "./staff";

export type QuoteThresholds = {
  minItemCount: number;
  minCartTotal: number;
};

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

export async function getQuoteThresholds(): Promise<QuoteThresholds> {
  const org = await getLuxesupplyOrg();
  const salesPortal = (org.data.salesPortal || {}) as Record<string, unknown>;
  return normalizeQuoteThresholds(salesPortal.quoteThresholds);
}

/** Wire/payment instructions printed on branded invoice PDFs (staff-editable). */
export async function getPaymentInstructions(): Promise<string> {
  const org = await getLuxesupplyOrg();
  const salesPortal = (org.data.salesPortal || {}) as Record<string, unknown>;
  return String(salesPortal.paymentInstructions || "").trim();
}

/** Extra staff-notification recipients on top of active `salesPortalStaff` accounts. */
export async function getNotifyEmails(): Promise<string[]> {
  const org = await getLuxesupplyOrg();
  const salesPortal = (org.data.salesPortal || {}) as Record<string, unknown>;
  const raw = salesPortal.notifyEmails;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

export async function saveQuoteSettings(input: {
  minItemCount: number;
  minCartTotal: number;
  notifyEmails: string[];
  paymentInstructions?: string;
}): Promise<void> {
  const org = await getLuxesupplyOrg();
  const ref = getDb().collection("organizations").doc(org.id);
  const prev = (org.data.salesPortal || {}) as Record<string, unknown>;
  await ref.set(
    {
      salesPortal: {
        ...prev,
        quoteThresholds: normalizeQuoteThresholds({
          minItemCount: input.minItemCount,
          minCartTotal: input.minCartTotal,
        }),
        notifyEmails: input.notifyEmails,
        ...(input.paymentInstructions !== undefined
          ? { paymentInstructions: String(input.paymentInstructions).trim().slice(0, 2000) }
          : {}),
        updatedAt: new Date(),
      },
      updatedAt: new Date(),
    },
    { merge: true },
  );
}
