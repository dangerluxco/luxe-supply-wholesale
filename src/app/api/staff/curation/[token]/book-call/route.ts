import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getCurationShareForStaff, linkCurationShareToBuyer } from "@/lib/firestore/curation";
import { getBuyerById } from "@/lib/firestore/buyers";
import { buyerStorefrontOrigin, staffPortalOrigin } from "@/lib/notify";
import {
  buildGoogleCalendarUrl,
  defaultCallDurationMinutes,
  defaultCallStart,
} from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

/**
 * "Book call" for an ad-hoc curation session. Returns structured event draft
 * fields for the in-portal modal (Eelo-style), plus a default Calendar template
 * URL. Full Calendar API create isn't available — staff OAuth is sign-in only.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { buyerId?: string };

  const share = await getCurationShareForStaff(token);
  if (!share) return NextResponse.json({ error: "This curation link is unavailable." }, { status: 404 });
  if (!share.items.length) {
    return NextResponse.json({ error: "Add at least one item before booking a call." }, { status: 400 });
  }

  const buyerId = String(body.buyerId || share.linkedBuyerId || "").trim();
  if (!buyerId) {
    return NextResponse.json({ error: "Pick a buyer first." }, { status: 400 });
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
    ]
      .filter((line): line is string => line != null)
      .join("\n");

    const title = `Call with ${buyerLabel} — curated selection`;
    const guestEmails = [...new Set([buyer.email, session.email].filter(Boolean))];
    const start = defaultCallStart();
    const durationMinutes = defaultCallDurationMinutes();
    const calendarUrl = buildGoogleCalendarUrl({
      title,
      details,
      guestEmails,
      start,
      durationMinutes,
    });

    return NextResponse.json({
      ok: true,
      calendarUrl,
      curationUrl,
      sellerCurationUrl: `/wholesaleportal/rep/curation/${token}`,
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
