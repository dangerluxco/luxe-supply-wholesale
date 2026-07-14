import type { Query } from "firebase-admin/firestore";
import { getDb, toIso } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import { INVOICE_REQUEST_TIMEOUT_DAYS } from "@/lib/constants";
import { releaseAllHoldsForQuote } from "./holds";
import { archiveSuggestedLot } from "./suggestedLots";
import { markSkusSold } from "./catalog";

// Internal name matches the `salesPortalQuotes` Firestore collection so we don't
// migrate live data. Buyer/staff UI presents these documents as "invoice requests".
export type PortalQuote = {
  id: string;
  status: string;
  portalUsername: string;
  buyerDisplayName: string;
  customerName: string;
  customerEmail: string;
  customerCompany: string;
  customerPhone: string;
  message: string;
  items: Array<Record<string, unknown>>;
  itemCount: number;
  cartTotal: number | null;
  adminNotes: string;
  createdAt: string | null;
  updatedAt: string | null;
  /** Set once staff generates a formal invoice from this request. */
  invoiceId: string | null;
  invoiceNumber: string | null;
};

export type QuoteItemInput = {
  sku: string;
  title?: string;
  brand?: string;
  quantity?: number;
  price: number;
  imageUrl?: string | null;
  isSuggestedLot?: boolean;
  lotId?: string;
  lotItems?: Array<Record<string, unknown>>;
};

/** Expand a quote line item to the inventory SKU(s) it holds (lots expand to their member SKUs). */
export function expandQuoteItemSkus(item: Record<string, unknown>): string[] {
  if (item.isSuggestedLot && Array.isArray(item.lotItems)) {
    return (item.lotItems as Array<Record<string, unknown>>)
      .map((li) => String(li?.sku || "").trim())
      .filter(Boolean);
  }
  const sku = String(item.sku || "").trim();
  return sku && !sku.startsWith("lot:") ? [sku] : [];
}

export function expandQuoteAllSkus(items: Array<Record<string, unknown>>): string[] {
  return [...new Set(items.flatMap((it) => expandQuoteItemSkus(it)))];
}

export function lotIdsFromQuoteItems(items: Array<Record<string, unknown>>): string[] {
  const ids = new Set<string>();
  for (const it of items) {
    if (!it.isSuggestedLot) continue;
    const lotId = String(it.lotId || "").trim();
    if (lotId) ids.add(lotId);
  }
  return [...ids];
}

function serializeQuote(id: string, d: Record<string, unknown>): PortalQuote {
  const items = Array.isArray(d.items) ? (d.items as Array<Record<string, unknown>>) : [];
  return {
    id,
    status: String(d.status || "open"),
    portalUsername: String(d.portalUsername || ""),
    buyerDisplayName: String(d.buyerDisplayName || ""),
    customerName: String(d.customerName || ""),
    customerEmail: String(d.customerEmail || ""),
    customerCompany: String(d.customerCompany || ""),
    customerPhone: String(d.customerPhone || ""),
    message: String(d.message || ""),
    items,
    itemCount: Number(d.itemCount || items.length || 0),
    cartTotal: d.cartTotal != null ? Number(d.cartTotal) : null,
    adminNotes: String(d.adminNotes || ""),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    invoiceId: d.invoiceId ? String(d.invoiceId) : null,
    invoiceNumber: d.invoiceNumber ? String(d.invoiceNumber) : null,
  };
}

export async function listQuotes(options?: {
  status?: string;
  limit?: number;
}): Promise<{ quotes: PortalQuote[]; openCount: number; organizationId: string }> {
  const org = await getLuxesupplyOrg();
  const statusFilter = String(options?.status || "open").toLowerCase();
  const limitCount = Math.min(Math.max(options?.limit || 50, 1), 100);
  const db = getDb();

  let query: Query = db
    .collection("salesPortalQuotes")
    .where("organizationId", "==", org.id);

  if (statusFilter && statusFilter !== "all") {
    query = query.where("status", "==", statusFilter);
  }

  let snap;
  try {
    snap = await query.orderBy("createdAt", "desc").limit(limitCount).get();
  } catch {
    snap = await query.limit(limitCount).get();
  }

  const quotes = snap.docs
    .map((doc) => serializeQuote(doc.id, doc.data() || {}))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  let openCount = 0;
  try {
    const openSnap = await db
      .collection("salesPortalQuotes")
      .where("organizationId", "==", org.id)
      .where("status", "==", "open")
      .limit(100)
      .get();
    openCount = openSnap.size;
  } catch {
    openCount = quotes.filter((q) => q.status === "open").length;
  }

  return { quotes, openCount, organizationId: org.id };
}

export async function getQuoteById(id: string): Promise<PortalQuote | null> {
  if (!id) return null;
  const snap = await getDb().collection("salesPortalQuotes").doc(id).get();
  if (!snap.exists) return null;
  return serializeQuote(snap.id, snap.data() || {});
}

export async function listQuotesForBuyer(
  username: string,
  limitCount = 50,
): Promise<PortalQuote[]> {
  if (!username) return [];
  const org = await getLuxesupplyOrg();
  const db = getDb();

  let snap;
  try {
    snap = await db
      .collection("salesPortalQuotes")
      .where("organizationId", "==", org.id)
      .where("portalUsername", "==", username)
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get();
  } catch {
    snap = await db
      .collection("salesPortalQuotes")
      .where("organizationId", "==", org.id)
      .where("portalUsername", "==", username)
      .limit(limitCount)
      .get();
  }

  return snap.docs
    .map((doc) => serializeQuote(doc.id, doc.data() || {}))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function updateQuoteStatus(
  quoteId: string,
  updates: { status?: string; adminNotes?: string },
  updatedBy: string,
): Promise<PortalQuote> {
  const ref = getDb().collection("salesPortalQuotes").doc(quoteId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Quote not found");

  const payload: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy,
  };
  if (updates.status != null) payload.status = String(updates.status).toLowerCase();
  if (updates.adminNotes != null) payload.adminNotes = String(updates.adminNotes).slice(0, 4000);

  await ref.update(payload);
  const next = await ref.get();
  return serializeQuote(next.id, next.data() || {});
}

/**
 * Staff edit of line items: remove products and/or adjust unit prices, then
 * recompute itemCount/cartTotal from the surviving items.
 */
export async function updateQuoteItems(
  quoteId: string,
  items: QuoteItemInput[],
  updatedBy: string,
): Promise<PortalQuote> {
  const ref = getDb().collection("salesPortalQuotes").doc(quoteId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Invoice request not found.");

  const cleanItems = items
    .map((i) => ({
      sku: String(i.sku || "").trim(),
      title: String(i.title || ""),
      brand: String(i.brand || ""),
      quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
      price: Math.max(0, Number(i.price) || 0),
      imageUrl: i.imageUrl ? String(i.imageUrl) : null,
      isSuggestedLot: !!i.isSuggestedLot,
      lotId: i.isSuggestedLot ? String(i.lotId || "") : "",
      lotItems: i.isSuggestedLot && Array.isArray(i.lotItems) ? i.lotItems : [],
    }))
    .filter((i) => i.sku);

  const cartTotal = cleanItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  await ref.update({
    items: cleanItems,
    itemCount: cleanItems.length,
    cartTotal,
    updatedAt: new Date(),
    updatedBy,
  });

  const next = await ref.get();
  return serializeQuote(next.id, next.data() || {});
}

/** Link an invoice request to the formal invoice generated from it. */
export async function linkQuoteToInvoice(
  quoteId: string,
  invoice: { id: string; invoiceNumber: string },
): Promise<void> {
  await getDb().collection("salesPortalQuotes").doc(quoteId).update({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: "quoted",
    updatedAt: new Date(),
  });
}

/** On invoice generation / approval: mark SKUs sold and clear soft-holds for this request. */
export async function finalizeInvoiceRequestAsSold(
  quoteId: string,
  updatedBy: string,
): Promise<void> {
  const quote = await getQuoteById(quoteId);
  if (!quote) return;
  const skus = expandQuoteAllSkus(quote.items);
  if (skus.length) {
    await markSkusSold(skus);
  }
  await releaseAllHoldsForQuote(quoteId);
  for (const lotId of lotIdsFromQuoteItems(quote.items)) {
    try {
      await archiveSuggestedLot(lotId, updatedBy || "system:invoice-approved");
    } catch (err) {
      console.warn("[quotes] archive lot on approve:", lotId, err);
    }
  }
}

/**
 * Pending open/contacted requests older than INVOICE_REQUEST_TIMEOUT_DAYS → timed_out,
 * release holds, deactivate any bundles included in the request.
 */
export async function expireStaleInvoiceRequests(
  maxAgeDays = INVOICE_REQUEST_TIMEOUT_DAYS,
): Promise<{ timedOut: string[]; checked: number }> {
  const cutoff = Date.now() - Math.max(1, maxAgeDays) * 24 * 60 * 60 * 1000;
  const { quotes } = await listQuotes({ status: "all", limit: 200 });
  const pending = quotes.filter((q) => q.status === "open" || q.status === "contacted");
  const timedOut: string[] = [];

  for (const quote of pending) {
    const anchor = quote.createdAt || quote.updatedAt;
    if (!anchor) continue;
    const ts = Date.parse(anchor);
    if (!Number.isFinite(ts) || ts > cutoff) continue;

    await updateQuoteStatus(quote.id, { status: "timed_out" }, "system:expire-requests");
    await releaseAllHoldsForQuote(quote.id);
    for (const lotId of lotIdsFromQuoteItems(quote.items)) {
      try {
        await archiveSuggestedLot(lotId, "system:expire-requests");
      } catch (err) {
        console.warn("[quotes] archive lot on timeout:", lotId, err);
      }
    }
    timedOut.push(quote.id);
  }

  return { timedOut, checked: pending.length };
}

export { QUOTE_STATUSES } from "@/lib/constants";
