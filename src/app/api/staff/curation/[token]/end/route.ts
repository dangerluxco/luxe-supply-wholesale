import { logAudit } from "@/lib/firestore/audit";
import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { endCurationSession, type CurationItem } from "@/lib/firestore/curation";
import {
  getQuoteById,
  updateQuoteItems,
  expandQuoteItemSkus,
  type QuoteItemInput,
} from "@/lib/firestore/quotes";
import { releaseQuoteHoldsForSkus } from "@/lib/firestore/holds";

export const dynamic = "force-dynamic";

/**
 * Map a curation item back onto an order line. Suggested-lot lines collapse
 * into a single bundle row when they enter a curation session (see
 * `curationItemsFromQuoteItems`) and lose their per-piece structure in the
 * process — so if this SKU matches a lot already on the order, reuse that
 * lot's original `lotItems` (only the price may have changed on the call)
 * instead of writing it back as a single bogus "SKU".
 */
function toQuoteItemInput(
  item: CurationItem,
  lotsByLotId: Map<string, Record<string, unknown>>,
): QuoteItemInput {
  const lot = lotsByLotId.get(item.sku);
  if (lot) {
    return {
      sku: item.sku,
      title: item.title,
      brand: item.brand,
      quantity: 1,
      price: item.price,
      imageUrl: item.imageUrl,
      isSuggestedLot: true,
      lotId: String(lot.lotId || item.sku),
      lotItems: Array.isArray(lot.lotItems) ? (lot.lotItems as Array<Record<string, unknown>>) : [],
    };
  }
  return {
    sku: item.sku,
    title: item.title,
    brand: item.brand,
    quantity: 1,
    price: item.price,
    imageUrl: item.imageUrl,
  };
}

export async function POST(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  try {
    const { revision, summary, quoteId, linkedBuyerId, items, approvedItems } =
      await endCurationSession(token);

    // If this link came from "Book call" on an existing order, sync that
    // order's line items to match the call's outcome: only items the buyer
    // explicitly declined come off (holds released); approved, "maybe", and
    // never-acted-on items all stay on the order with whatever price the
    // rep landed on during the call.
    let orderSynced = false;
    let orderSyncError: string | null = null;
    let removedCount = 0;
    if (quoteId) {
      try {
        const before = await getQuoteById(quoteId);
        if (!before) throw new Error("Order request not found.");

        const lotsByLotId = new Map(
          before.items
            .filter((it) => it.isSuggestedLot && it.lotId)
            .map((it) => [String(it.lotId), it] as const),
        );

        // Items that were already on the order before this call get the
        // benefit of the doubt — they stay unless the buyer explicitly
        // declined them. Items the rep introduced live during the call are
        // new asks, though, so they only make it onto the order if the buyer
        // actually approved them; no decision (or "maybe") just means "don't
        // add this yet".
        const keptItems = items.filter((it) =>
          it.liveAdded ? it.decision === "approve" : it.decision !== "decline",
        );
        const nextItems: QuoteItemInput[] = keptItems.map((it) => toQuoteItemInput(it, lotsByLotId));

        const keepSkus = new Set(nextItems.flatMap((i) => expandQuoteItemSkus(i as Record<string, unknown>)));
        const removedSkus = before.items
          .flatMap((it) => expandQuoteItemSkus(it))
          .filter((sku) => !keepSkus.has(sku));

        await updateQuoteItems(quoteId, nextItems, session.email);
        if (removedSkus.length) {
          await releaseQuoteHoldsForSkus(quoteId, removedSkus);
          removedCount = removedSkus.length;
        }
        orderSynced = true;
      } catch (err) {
        orderSyncError = err instanceof Error ? err.message : "Could not sync the order request.";
      }
    }

    // Ad-hoc session (no order yet) with a buyer picked via "Book call" and at
    // least one approved item — offer to create a new order request from it.
    // Staff confirms this explicitly; it never happens automatically.
    const canCreateOrder = !quoteId && !!linkedBuyerId && approvedItems.length > 0;

    await logAudit({
      actor: session,
      action: "curation.ended",
      entity: "curation",
      entityId: token,
      payload: { approved: approvedItems.length },
    });
    return NextResponse.json({
      ok: true,
      revision,
      summary,
      quoteId,
      orderSynced,
      orderSyncError,
      removedCount,
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
