import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getCurationShareForStaff, linkCurationShareToQuote } from "@/lib/firestore/curation";
import { getBuyerById } from "@/lib/firestore/buyers";
import { createStaffQuote, type QuoteItemInput } from "@/lib/firestore/quotes";
import { staffPortalOrigin } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Turns an ad-hoc curation session's approved items into a brand-new order
 * request once the call is over — the counterpart to syncing INTO an existing
 * order when the session already had one. Staff explicitly confirms this from
 * the UI; it's never automatic.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const share = await getCurationShareForStaff(token);
  if (!share) return NextResponse.json({ error: "This curation link is unavailable." }, { status: 404 });
  if (share.quoteId) {
    return NextResponse.json({ error: "This session is already linked to an order request." }, { status: 400 });
  }
  if (!share.linkedBuyerId) {
    return NextResponse.json(
      { error: "No buyer is linked to this session — use \"Book call\" to pick one first." },
      { status: 400 },
    );
  }

  const buyer = await getBuyerById(share.linkedBuyerId);
  if (!buyer) return NextResponse.json({ error: "Linked buyer not found." }, { status: 404 });

  const approved = share.items.filter((it) => it.decision === "approve");
  if (!approved.length) {
    return NextResponse.json({ error: "No approved items to create an order from." }, { status: 400 });
  }

  try {
    const items: QuoteItemInput[] = approved.map((it) => ({
      sku: it.sku,
      title: it.title,
      brand: it.brand,
      quantity: 1,
      price: it.price,
      imageUrl: it.imageUrl,
    }));

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
      message: `Created from a curation call (${approved.length} item${approved.length === 1 ? "" : "s"} approved).`,
      createdByEmail: session.email,
      createdByDisplayName: session.name,
      curationToken: token,
    });
    await linkCurationShareToQuote(token, quoteId);

    return NextResponse.json({
      ok: true,
      quoteId,
      quoteUrl: `${staffPortalOrigin()}/wholesaleportal/rep/quotes/${quoteId}`,
      itemCount: approved.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the order request." },
      { status: 400 },
    );
  }
}
