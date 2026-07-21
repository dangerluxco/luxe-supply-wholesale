import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getCurationShareForStaff, linkCurationShareToQuote } from "@/lib/firestore/curation";
import { getBuyerById } from "@/lib/firestore/buyers";
import { createStaffQuote, type QuoteItemInput } from "@/lib/firestore/quotes";
import { staffPortalOrigin } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Creates a brand-new order request from a curation session and links it.
 * - Live / pre-call: all priced items (same idea as Curate Order builder).
 * - After session end: approved items only.
 * Staff must confirm from the UI; never automatic.
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
  const priced = share.items.filter((it) => Number(it.price) > 0);
  const source = share.sessionEnded ? approved : priced;
  if (!source.length) {
    return NextResponse.json(
      {
        error: share.sessionEnded
          ? "No approved items to create an order from."
          : "Add at least one priced item before creating an order request.",
      },
      { status: 400 },
    );
  }

  try {
    const items: QuoteItemInput[] = source.map((it) => ({
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
      message: share.sessionEnded
        ? `Created from a curation call (${source.length} item${source.length === 1 ? "" : "s"} approved).`
        : `Created from curation link (${source.length} item${source.length === 1 ? "" : "s"}).`,
      createdByEmail: session.email,
      createdByDisplayName: session.name,
      curationToken: token,
    });
    await linkCurationShareToQuote(token, quoteId);

    return NextResponse.json({
      ok: true,
      quoteId,
      quoteUrl: `${staffPortalOrigin()}/wholesaleportal/rep/quotes/${quoteId}`,
      itemCount: source.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the order request." },
      { status: 400 },
    );
  }
}
