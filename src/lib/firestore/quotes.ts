import type { Query } from "firebase-admin/firestore";
import { getDb, toIso, WHOLESALE_ORG_SLUG } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import { INVOICE_REQUEST_TIMEOUT_DAYS } from "@/lib/constants";
import { releaseAllHoldsForQuote } from "./holds";
import { archiveSuggestedLot } from "./suggestedLots";
import { markSkusSold, resolveTitlesForSkus } from "./catalog";

// Internal name matches the `salesPortalQuotes` Firestore collection so we don't
// migrate live data. Buyer/staff UI presents these documents as "order requests".
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
  shippingMethodId: string;
  shippingLabel: string;
  shipping: number;
  adminNotes: string;
  /** Staff member currently working this request (optional claim). */
  claimedByEmail: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Set once staff generates a formal invoice from this request. */
  invoiceId: string | null;
  invoiceNumber: string | null;
  /** Most recent "Book call" curation-share token, if any — kept so the buyer/seller
   *  links stay visible on this request after navigating away and back. */
  curationToken: string | null;
  curationCreatedAt: string | null;
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
    const seen = new Set<string>();
    const skus: string[] = [];
    for (const li of item.lotItems as Array<Record<string, unknown>>) {
      const sku = String(li?.sku || "").trim();
      if (!sku) continue;
      const key = sku.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      skus.push(sku);
    }
    return skus;
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

export type QuoteCurationItem = {
  sku: string;
  title: string;
  brand: string;
  price: number;
  imageUrl: string | null;
  imageUrls: string[];
};

/**
 * Map an order request's line items into curation-share rows so staff can spin up a
 * pre-populated curation view for a sales call. Suggested-lot lines collapse into a
 * single bundle row carrying every piece's photo (browsable via the viewer's lightbox).
 */
export function curationItemsFromQuoteItems(
  items: Array<Record<string, unknown>>,
): QuoteCurationItem[] {
  return items
    .map((it): QuoteCurationItem | null => {
      if (it.isSuggestedLot && Array.isArray(it.lotItems) && it.lotItems.length) {
        const lotItems = it.lotItems as Array<Record<string, unknown>>;
        const imageUrls = lotItems.map((li) => String(li.imageUrl || "").trim()).filter(Boolean);
        const lotId = String(it.lotId || it.sku || "").trim();
        if (!lotId) return null;
        return {
          sku: lotId,
          title: String(it.title || "").trim() || `${lotItems.length}-piece bundle`,
          brand: "",
          price: Number(it.price) || 0,
          imageUrl: imageUrls[0] || (it.imageUrl ? String(it.imageUrl) : null),
          imageUrls,
        };
      }
      const sku = String(it.sku || "").trim();
      if (!sku) return null;
      const imageUrl = it.imageUrl ? String(it.imageUrl).trim() : "";
      return {
        sku,
        title: String(it.title || sku).trim() || sku,
        brand: String(it.brand || "").trim(),
        price: Number(it.price) || 0,
        imageUrl: imageUrl || null,
        imageUrls: imageUrl ? [imageUrl] : [],
      };
    })
    .filter((it): it is QuoteCurationItem => it !== null);
}

function dedupeLotItemsRaw(
  lotItems: Array<Record<string, unknown>> | undefined,
): Array<Record<string, unknown>> {
  if (!Array.isArray(lotItems) || !lotItems.length) return [];
  const seen = new Set<string>();
  const out: Array<Record<string, unknown>> = [];
  for (const li of lotItems) {
    const sku = String(li?.sku || "").trim();
    if (!sku) continue;
    const key = sku.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...li, sku });
  }
  return out;
}

function serializeQuote(id: string, d: Record<string, unknown>): PortalQuote {
  const rawItems = Array.isArray(d.items) ? (d.items as Array<Record<string, unknown>>) : [];
  const items = rawItems.map((it) => {
    if (!it?.isSuggestedLot || !Array.isArray(it.lotItems)) return it;
    return { ...it, lotItems: dedupeLotItemsRaw(it.lotItems as Array<Record<string, unknown>>) };
  });
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
    shippingMethodId: String(d.shippingMethodId || ""),
    shippingLabel: String(d.shippingLabel || ""),
    shipping: Number(d.shipping || 0),
    adminNotes: String(d.adminNotes || ""),
    claimedByEmail: d.claimedByEmail ? String(d.claimedByEmail) : null,
    claimedByName: d.claimedByName ? String(d.claimedByName) : null,
    claimedAt: toIso(d.claimedAt),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    invoiceId: d.invoiceId ? String(d.invoiceId) : null,
    invoiceNumber: d.invoiceNumber ? String(d.invoiceNumber) : null,
    curationToken: d.curationToken ? String(d.curationToken) : null,
    curationCreatedAt: toIso(d.curationCreatedAt),
  };
}

function needsLiveTitle(title: unknown, sku: unknown): boolean {
  const cleanTitle = String(title || "").trim();
  const cleanSku = String(sku || "").trim();
  return !cleanTitle || (!!cleanSku && cleanTitle.toLowerCase() === cleanSku.toLowerCase());
}

function applyLiveTitle(row: Record<string, unknown>, titles: Map<string, string>) {
  const sku = String(row.sku || "").trim();
  if (!sku || !needsLiveTitle(row.title, sku)) return row;
  const liveTitle = titles.get(sku) || titles.get(sku.toUpperCase());
  return liveTitle && !needsLiveTitle(liveTitle, sku) ? { ...row, title: liveTitle } : row;
}

async function hydrateQuoteItemTitles(quote: PortalQuote): Promise<PortalQuote> {
  const skus: string[] = [];
  for (const item of quote.items) {
    if (needsLiveTitle(item.title, item.sku)) skus.push(String(item.sku || ""));
    if (Array.isArray(item.lotItems)) {
      for (const lotItem of item.lotItems as Array<Record<string, unknown>>) {
        if (needsLiveTitle(lotItem.title, lotItem.sku)) skus.push(String(lotItem.sku || ""));
      }
    }
  }
  const cleanSkus = skus.map((sku) => sku.trim()).filter(Boolean);
  if (!cleanSkus.length) return quote;

  const titles = await resolveTitlesForSkus(cleanSkus);
  return {
    ...quote,
    items: quote.items.map((item) => {
      const row = applyLiveTitle(item, titles);
      if (!Array.isArray(row.lotItems)) return row;
      return {
        ...row,
        lotItems: (row.lotItems as Array<Record<string, unknown>>).map((lotItem) =>
          applyLiveTitle(lotItem, titles),
        ),
      };
    }),
  };
}

export async function listQuotes(options?: {
  status?: string;
  limit?: number;
}): Promise<{ quotes: PortalQuote[]; openCount: number; organizationId: string }> {
  const org = await getLuxesupplyOrg();
  const statusFilter = String(options?.status || "open").toLowerCase();
  // Ceiling raised from 100 to 500 so the performance dashboard can pull a full
  // year of quotes for conversion metrics; existing callers still pass ≤100.
  const limitCount = Math.min(Math.max(options?.limit || 50, 1), 500);
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
  return hydrateQuoteItemTitles(serializeQuote(snap.id, snap.data() || {}));
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

/** Claim an order request for the signed-in staff member (or take over). */
export async function claimQuote(
  quoteId: string,
  staff: { email: string; name: string },
): Promise<PortalQuote> {
  const ref = getDb().collection("salesPortalQuotes").doc(quoteId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Order request not found.");

  const email = String(staff.email || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
  if (!email) throw new Error("Staff email required to claim.");

  await ref.update({
    claimedByEmail: email,
    claimedByName: String(staff.name || email).slice(0, 120),
    claimedAt: new Date(),
    updatedAt: new Date(),
    updatedBy: email,
  });

  const next = await ref.get();
  return serializeQuote(next.id, next.data() || {});
}

/** Clear the staff claim so another rep can pick it up. */
export async function releaseQuoteClaim(
  quoteId: string,
  updatedBy: string,
): Promise<PortalQuote> {
  const ref = getDb().collection("salesPortalQuotes").doc(quoteId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Order request not found.");

  await ref.update({
    claimedByEmail: null,
    claimedByName: null,
    claimedAt: null,
    updatedAt: new Date(),
    updatedBy: String(updatedBy || "").slice(0, 200),
  });

  const next = await ref.get();
  return serializeQuote(next.id, next.data() || {});
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
  if (!snap.exists) throw new Error("Order request not found.");

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

/** Record the curation-share token created by "Book call" so its links persist on this request. */
export async function linkQuoteToCurationShare(quoteId: string, token: string): Promise<void> {
  await getDb().collection("salesPortalQuotes").doc(quoteId).update({
    curationToken: token,
    curationCreatedAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * Staff-initiated order request — for when a sales rep curates a list and runs a
 * call with a buyer before any order exists yet (as opposed to the normal flow,
 * where the buyer submits their own cart). Auto-claims it for the rep who ran the
 * call and links it to the curation session that produced it.
 */
export async function createStaffQuote(opts: {
  buyer: { id: string; username: string; displayName: string; email: string; company: string; phone: string };
  items: QuoteItemInput[];
  status?: string;
  message?: string;
  createdByEmail: string;
  createdByDisplayName: string;
  curationToken?: string;
}): Promise<{ id: string }> {
  const org = await getLuxesupplyOrg();
  const cleanItems = opts.items
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
  if (!cleanItems.length) throw new Error("Add at least one approved item before creating an order.");

  const cartTotal = cleanItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const now = new Date();
  const ref = getDb().collection("salesPortalQuotes").doc();
  await ref.set({
    orgSlug: WHOLESALE_ORG_SLUG,
    orgName: String(org.data.displayName || org.data.name || WHOLESALE_ORG_SLUG),
    organizationId: org.id,
    status: opts.status || "contacted",
    portalUsername: opts.buyer.username,
    buyerDisplayName: opts.buyer.displayName,
    customerName: opts.buyer.displayName || opts.buyer.username,
    customerEmail: opts.buyer.email || "",
    customerCompany: opts.buyer.company || "",
    customerPhone: opts.buyer.phone || "",
    message: String(opts.message || "Created by staff from a curation call.").slice(0, 2000),
    items: cleanItems,
    itemCount: cleanItems.length,
    cartTotal,
    shippingMethodId: "",
    shippingLabel: "",
    shipping: 0,
    adminNotes: "",
    claimedByEmail: opts.createdByEmail,
    claimedByName: opts.createdByDisplayName,
    claimedAt: now,
    createdAt: now,
    updatedAt: now,
    invoiceId: null,
    invoiceNumber: null,
    curationToken: opts.curationToken || null,
    curationCreatedAt: opts.curationToken ? now : null,
  });
  return { id: ref.id };
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
