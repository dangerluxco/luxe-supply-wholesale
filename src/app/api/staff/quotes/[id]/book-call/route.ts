import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getQuoteById, curationItemsFromQuoteItems } from "@/lib/firestore/quotes";
import { createCurationShare } from "@/lib/firestore/curation";
import { buyerStorefrontOrigin, staffPortalOrigin } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Long enough runway for staff to schedule a call days out and still have a live link by then.
const CALL_LINK_EXPIRES_HOURS = 168;
const DEFAULT_CALL_DURATION_MINUTES = 30;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Google Calendar's TEMPLATE `dates` param wants basic ISO (no dashes/colons/millis). */
function toGoogleDateStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/** Placeholder start time — tomorrow, rounded up to the next hour. Staff adjusts in Calendar. */
function defaultCallStart(): Date {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d;
}

function buildGoogleCalendarUrl(opts: {
  title: string;
  details: string;
  guestEmail?: string;
}): string {
  const start = defaultCallStart();
  const end = new Date(start.getTime() + DEFAULT_CALL_DURATION_MINUTES * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    details: opts.details,
    dates: `${toGoogleDateStamp(start)}/${toGoogleDateStamp(end)}`,
  });
  if (opts.guestEmail) params.set("add", opts.guestEmail);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id } = await params;
  const quote = await getQuoteById(id);
  if (!quote) {
    return NextResponse.json({ error: "Order request not found." }, { status: 404 });
  }

  const curationItems = curationItemsFromQuoteItems(quote.items);
  if (!curationItems.length) {
    return NextResponse.json(
      { error: "This request has no priced items to build a curation link from." },
      { status: 400 },
    );
  }

  try {
    const share = await createCurationShare({
      items: curationItems,
      clientName: quote.customerName || quote.buyerDisplayName || "",
      note: `Call prep for order request #${quote.id}`,
      expiresHours: CALL_LINK_EXPIRES_HOURS,
      createdByEmail: session.email,
      createdByDisplayName: session.name,
    });
    const curationUrl = `${buyerStorefrontOrigin()}/curation/${share.token}`;
    const sellerCurationUrl = `${staffPortalOrigin()}/wholesaleportal/rep/curation/${share.token}`;
    const quoteUrl = `${staffPortalOrigin()}/wholesaleportal/rep/quotes/${quote.id}`;

    const buyerLabel = quote.customerName || quote.buyerDisplayName || "the buyer";
    const orderTotal =
      quote.cartTotal != null ? Math.round(quote.cartTotal + (quote.shipping || 0)) : null;

    const details = [
      `Call to review order request #${quote.id} with ${buyerLabel}.`,
      "",
      `Buyer: ${buyerLabel}`,
      quote.customerEmail ? `Email: ${quote.customerEmail}` : null,
      quote.customerCompany ? `Company: ${quote.customerCompany}` : null,
      quote.customerPhone ? `Phone: ${quote.customerPhone}` : null,
      `Items: ${quote.itemCount || quote.items.length}`,
      orderTotal != null ? `Order total: $${orderTotal.toLocaleString()}` : null,
      "",
      `Curation view for the call: ${curationUrl}`,
      `Order request: ${quoteUrl}`,
    ].filter((line): line is string => line != null);

    const calendarUrl = buildGoogleCalendarUrl({
      title: `Call with ${buyerLabel} — Order #${quote.id}`,
      details: details.join("\n"),
      guestEmail: quote.customerEmail || undefined,
    });

    return NextResponse.json({ ok: true, calendarUrl, curationUrl, sellerCurationUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not prepare the call." },
      { status: 400 },
    );
  }
}
