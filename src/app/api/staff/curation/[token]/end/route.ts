import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { endCurationSession } from "@/lib/firestore/curation";
import { updateQuoteItems, type QuoteItemInput } from "@/lib/firestore/quotes";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  try {
    const { revision, summary, quoteId, linkedBuyerId, approvedItems } =
      await endCurationSession(token);

    // If this link came from "Book call" on an existing order, sync that order's
    // line items to exactly what the buyer approved (final prices included). A
    // sync failure shouldn't block the session from ending; just report it.
    let orderSynced = false;
    let orderSyncError: string | null = null;
    if (quoteId) {
      try {
        const items: QuoteItemInput[] = approvedItems.map((it) => ({
          sku: it.sku,
          title: it.title,
          brand: it.brand,
          quantity: 1,
          price: it.price,
          imageUrl: it.imageUrl,
        }));
        await updateQuoteItems(quoteId, items, session.email);
        orderSynced = true;
      } catch (err) {
        orderSyncError = err instanceof Error ? err.message : "Could not sync the order request.";
      }
    }

    // Ad-hoc session (no order yet) with a buyer picked via "Book call" and at
    // least one approved item — offer to create a new order request from it.
    // Staff confirms this explicitly; it never happens automatically.
    const canCreateOrder = !quoteId && !!linkedBuyerId && approvedItems.length > 0;

    return NextResponse.json({
      ok: true,
      revision,
      summary,
      quoteId,
      orderSynced,
      orderSyncError,
      canCreateOrder,
      approvedCount: approvedItems.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not end session." },
      { status: 400 },
    );
  }
}
