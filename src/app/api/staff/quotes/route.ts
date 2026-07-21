import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getBuyerById } from "@/lib/firestore/buyers";
import {
  createStaffQuote,
  getQuoteById,
  listQuotes,
  updateQuoteItems,
  type QuoteItemInput,
} from "@/lib/firestore/quotes";
import { staffPortalOrigin } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** Statuses that represent a deal being actively worked — the dashboard's
 * default "open orders" view (explicitly excludes invoiced/closed/declined/timed-out). */
const OPEN_ORDER_STATUSES = new Set(["open", "contacted"]);

export type DashboardOrderRow = {
  id: string;
  client: string;
  email: string;
  company: string;
  portalUsername: string;
  itemCount: number;
  total: number;
  status: string;
  claimedByName: string | null;
  createdAt: string | null;
};

type CreateBody = {
  buyerId?: string;
  items?: QuoteItemInput[];
  /** When set, update this existing order request's items instead of creating another. */
  quoteId?: string;
  message?: string;
};

/** Lightweight, poll-friendly list of order requests for the live staff dashboard. */
export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "open_orders").toLowerCase();

  try {
    const { quotes } = await listQuotes({ status: "all", limit: 100 });
    const filtered =
      status === "all"
        ? quotes
        : status === "open_orders"
          ? quotes.filter((q) => OPEN_ORDER_STATUSES.has(q.status))
          : quotes.filter((q) => q.status === status);

    const rows: DashboardOrderRow[] = filtered.map((q) => ({
      id: q.id,
      client: q.customerName || q.buyerDisplayName || q.customerEmail || "—",
      email: q.customerEmail || "",
      company: q.customerCompany || "",
      portalUsername: q.portalUsername || "",
      itemCount: q.itemCount || 0,
      total: Math.round((q.cartTotal || 0) + (q.shipping || 0)),
      status: q.status,
      claimedByName: q.claimedByName || null,
      createdAt: q.createdAt,
    }));

    return NextResponse.json({ ok: true, rows, revision: `${rows.length}:${rows[0]?.id || ""}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load orders." },
      { status: 400 },
    );
  }
}

/**
 * Staff-initiated order request from the Curate Order builder (client + priced
 * draft items). Reuses createStaffQuote — same path as post-call create-order.
 * Pass quoteId to refresh items on an in-progress session instead of duplicating.
 */
export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const buyerId = String(body.buyerId || "").trim();
  const existingQuoteId = String(body.quoteId || "").trim();
  if (!Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ error: "Add at least one priced item." }, { status: 400 });
  }

  const items: QuoteItemInput[] = body.items.map((it) => ({
    sku: String(it.sku || "").trim(),
    title: String(it.title || ""),
    brand: String(it.brand || ""),
    quantity: 1,
    price: Math.max(0, Number(it.price) || 0),
    imageUrl: it.imageUrl ? String(it.imageUrl) : null,
  }));
  if (items.some((it) => !it.sku || !(it.price > 0))) {
    return NextResponse.json(
      { error: "Every item needs a SKU and a price above $0." },
      { status: 400 },
    );
  }

  try {
    if (existingQuoteId) {
      const existing = await getQuoteById(existingQuoteId);
      if (!existing) {
        return NextResponse.json({ error: "Order request not found." }, { status: 404 });
      }
      await updateQuoteItems(existingQuoteId, items, session.email);
      return NextResponse.json({
        ok: true,
        quoteId: existingQuoteId,
        quoteUrl: `${staffPortalOrigin()}/wholesaleportal/rep/quotes/${existingQuoteId}`,
        itemCount: items.length,
        updated: true,
      });
    }

    if (!buyerId) {
      return NextResponse.json(
        { error: "Select an existing portal client to create an order request." },
        { status: 400 },
      );
    }

    const buyer = await getBuyerById(buyerId);
    if (!buyer || buyer.status === "disabled") {
      return NextResponse.json({ error: "Selected client was not found." }, { status: 400 });
    }

    const { id: quoteId } = await createStaffQuote({
      buyer: {
        id: buyer.id,
        username: buyer.username,
        displayName: buyer.displayName,
        email: buyer.email,
        company: buyer.company,
        phone: buyer.phone,
      },
      items,
      status: "contacted",
      message:
        String(body.message || "").trim() ||
        `Created from Curate Order (${items.length} item${items.length === 1 ? "" : "s"}).`,
      createdByEmail: session.email,
      createdByDisplayName: session.name,
    });

    return NextResponse.json({
      ok: true,
      quoteId,
      quoteUrl: `${staffPortalOrigin()}/wholesaleportal/rep/quotes/${quoteId}`,
      itemCount: items.length,
      updated: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the order request." },
      { status: 400 },
    );
  }
}
