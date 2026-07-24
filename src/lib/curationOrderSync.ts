import type { CurationItem } from "@/lib/firestore/curation";
import {
  getQuoteById,
  updateQuoteItems,
  expandQuoteItemSkus,
  type QuoteItemInput,
} from "@/lib/firestore/quotes";
import { releaseQuoteHoldsForSkus } from "@/lib/firestore/holds";

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
  // Bundle that wasn't on the order before (ad-hoc session / live add):
  // curation items carry their member pieces, so rebuild the lot line rather
  // than writing a bare "SKU" that loses the bundle's identity.
  if (item.lotItems?.length) {
    return {
      sku: item.sku,
      title: item.title,
      brand: item.brand,
      quantity: 1,
      price: item.price,
      imageUrl: item.imageUrl,
      isSuggestedLot: true,
      lotId: item.sku,
      lotItems: item.lotItems.map((li) => ({ sku: li.sku, title: li.title })),
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

/**
 * Sync a linked order request's line items to the curation call's current
 * state. Shared by the end-of-session auto-sync and the explicit mid-call
 * "Update order request" button — one set of rules:
 * - items already on the order stay unless the buyer explicitly declined them
 *   (declines come off, holds released);
 * - items the rep live-added during the call only join once approved;
 * - prices flow through as whatever the rep landed on.
 */
export async function syncQuoteItemsFromCuration(
  quoteId: string,
  items: CurationItem[],
  updatedBy: string,
): Promise<{ removedCount: number; itemCount: number }> {
  const before = await getQuoteById(quoteId);
  if (!before) throw new Error("Order request not found.");

  const lotsByLotId = new Map(
    before.items
      .filter((it) => it.isSuggestedLot && it.lotId)
      .map((it) => [String(it.lotId), it] as const),
  );

  const keptItems = items.filter((it) =>
    it.liveAdded ? it.decision === "approve" : it.decision !== "decline",
  );
  const nextItems: QuoteItemInput[] = keptItems.map((it) => toQuoteItemInput(it, lotsByLotId));

  const keepSkus = new Set(
    nextItems.flatMap((i) => expandQuoteItemSkus(i as Record<string, unknown>)),
  );
  const removedSkus = before.items
    .flatMap((it) => expandQuoteItemSkus(it))
    .filter((sku) => !keepSkus.has(sku));

  await updateQuoteItems(quoteId, nextItems, updatedBy);
  if (removedSkus.length) {
    await releaseQuoteHoldsForSkus(quoteId, removedSkus);
  }
  return { removedCount: removedSkus.length, itemCount: nextItems.length };
}
