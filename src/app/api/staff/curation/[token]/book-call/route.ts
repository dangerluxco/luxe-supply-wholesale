import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getCurationShareForStaff, linkCurationShareToBuyer } from "@/lib/firestore/curation";
import { getBuyerById } from "@/lib/firestore/buyers";
import { buyerStorefrontOrigin, staffPortalOrigin } from "@/lib/notify";
import { buildGoogleCalendarUrl } from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

/**
 * "Book call" for an ad-hoc curation session (built before any order request
 * exists). Links the chosen buyer to the session and opens a Calendar invite,
 * same shape as the order-based flow — the difference is there's no order to
 * reference yet; one gets created from the approved items when the call ends.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { buyerId?: string };
  const buyerId = String(body.buyerId || "").trim();
  if (!buyerId) {
    return NextResponse.json({ error: "Pick a buyer first." }, { status: 400 });
  }

  const share = await getCurationShareForStaff(token);
  if (!share) return NextResponse.json({ error: "This curation link is unavailable." }, { status: 404 });
  if (!share.items.length) {
    return NextResponse.json({ error: "Add at least one item before booking a call." }, { status: 400 });
  }

  const buyer = await getBuyerById(buyerId);
  if (!buyer) return NextResponse.json({ error: "Buyer not found." }, { status: 404 });
  if (!buyer.email) {
    return NextResponse.json(
      { error: "This buyer has no email on file — add one before booking a call." },
      { status: 400 },
    );
  }

  try {
    await linkCurationShareToBuyer(token, buyerId);

    const curationUrl = `${buyerStorefrontOrigin()}/curation/${token}`;
    const sellerCurationUrl = `${staffPortalOrigin()}/wholesaleportal/rep/curation/${token}`;
    const buyerLabel = buyer.displayName || buyer.username;
    const total = share.items.reduce((sum, it) => sum + it.price, 0);

    const details = [
      `Call to review a curated selection with ${buyerLabel}.`,
      "",
      `Buyer: ${buyerLabel}`,
      `Email: ${buyer.email}`,
      buyer.company ? `Company: ${buyer.company}` : null,
      buyer.phone ? `Phone: ${buyer.phone}` : null,
      `Items: ${share.items.length}`,
      `Estimated total: $${Math.round(total).toLocaleString()}`,
      "",
      `Curation view for the call: ${curationUrl}`,
      `Seller curation manager: ${sellerCurationUrl}`,
    ].filter((line): line is string => line != null);

    const calendarUrl = buildGoogleCalendarUrl({
      title: `Call with ${buyerLabel} — curated selection`,
      details: details.join("\n"),
      guestEmail: buyer.email,
    });

    return NextResponse.json({ ok: true, calendarUrl, curationUrl, sellerCurationUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not prepare the call." },
      { status: 400 },
    );
  }
}
