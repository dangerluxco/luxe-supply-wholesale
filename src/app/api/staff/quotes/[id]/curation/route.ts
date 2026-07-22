import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getQuoteById, curationItemsFromQuoteItems, linkQuoteToCurationShare } from "@/lib/firestore/quotes";
import { createCurationShare } from "@/lib/firestore/curation";
import { buyerStorefrontOrigin, staffPortalOrigin } from "@/lib/notify";
import { featureDisabledResponse } from "@/lib/feature-gates";

export const dynamic = "force-dynamic";

// Same runway as "Book call" links — plenty of time for a multi-day curation pass.
const CURATION_LINK_EXPIRES_HOURS = 168;

/**
 * Opens the curation view for this order request directly — no Google Calendar
 * popup. Reuses this order's existing curation session if one is already live
 * (so re-opening doesn't spin up a duplicate token); otherwise creates one from
 * the order's current line items, linked back to this order the same way
 * "Book call" does, so ending the session still syncs approved items back here.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const disabled = await featureDisabledResponse("curation");
  if (disabled) return disabled;

  const { id } = await params;
  const quote = await getQuoteById(id);
  if (!quote) {
    return NextResponse.json({ error: "Order request not found." }, { status: 404 });
  }

  try {
    let token = quote.curationToken;

    if (!token) {
      const curationItems = curationItemsFromQuoteItems(quote.items);
      if (!curationItems.length) {
        return NextResponse.json(
          { error: "This request has no priced items to build a curation view from." },
          { status: 400 },
        );
      }
      const share = await createCurationShare({
        items: curationItems,
        clientName: quote.customerName || quote.buyerDisplayName || "",
        note: `Curation view for order request #${quote.id}`,
        expiresHours: CURATION_LINK_EXPIRES_HOURS,
        createdByEmail: session.email,
        createdByDisplayName: session.name,
        quoteId: quote.id,
      });
      await linkQuoteToCurationShare(quote.id, share.token);
      token = share.token;
    }

    return NextResponse.json({
      ok: true,
      curationUrl: `${buyerStorefrontOrigin()}/curation/${token}`,
      sellerCurationUrl: `/wholesaleportal/rep/curation/${token}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not open curation view." },
      { status: 400 },
    );
  }
}
