import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import {
  getQuoteById,
  curationItemsFromQuoteItems,
  linkQuoteToCurationShare,
} from "@/lib/firestore/quotes";
import { createCurationShare } from "@/lib/firestore/curation";
import { recordBookedCall } from "@/lib/firestore/bookedCalls";
import { buyerStorefrontOrigin, staffPortalOrigin } from "@/lib/notify";
import {
  buildGoogleCalendarUrl,
  defaultCallDurationMinutes,
  defaultCallStart,
} from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

// Long enough runway for staff to schedule a call days out and still have a live link by then.
const CALL_LINK_EXPIRES_HOURS = 168;

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
      quoteId: quote.id,
    });
    await linkQuoteToCurationShare(quote.id, share.token);
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
      `Seller curation manager: ${sellerCurationUrl}`,
      `Order request: ${quoteUrl}`,
    ]
      .filter((line): line is string => line != null)
      .join("\n");

    const title = `Call with ${buyerLabel} — Order #${quote.id}`;
    const guestEmails = [
      ...new Set([quote.customerEmail || "", session.email].filter(Boolean)),
    ];
    const start = defaultCallStart();
    const durationMinutes = defaultCallDurationMinutes();
    const calendarUrl = buildGoogleCalendarUrl({
      title,
      details,
      guestEmails,
      start,
      durationMinutes,
    });

    // Dashboard "calls" source of truth — never fail the booking over it.
    await recordBookedCall({
      staffEmail: session.email,
      staffName: session.name,
      buyerLabel,
      quoteId: quote.id,
      curationToken: share.token,
      scheduledStartIso: start.toISOString(),
      durationMinutes,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      calendarUrl,
      curationUrl,
      sellerCurationUrl: `/wholesaleportal/rep/curation/${share.token}`,
      event: {
        title,
        details,
        guestEmails,
        startIso: start.toISOString(),
        durationMinutes,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not prepare the call." },
      { status: 400 },
    );
  }
}
