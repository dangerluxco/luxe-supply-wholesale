"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  expandQuoteItemSkus,
  getQuoteById,
  updateQuoteItems,
  type QuoteItemInput,
} from "@/lib/firestore/quotes";
import { releaseQuoteHoldsForSkus } from "@/lib/firestore/holds";

/** Thin entry for QuoteItemsEditor — isolated from portal.ts soft-nav stubs. */
export async function saveQuoteLineItems(quoteId: string, items: QuoteItemInput[]) {
  const session = await getSession();
  if (!session || session.source !== "firestore") {
    return { error: "Staff session required." };
  }
  const id = String(quoteId || "").trim();
  if (!id) return { error: "Missing order request id." };
  if (!Array.isArray(items)) return { error: "Invalid items." };

  try {
    const before = await getQuoteById(id);
    if (!before) return { error: "Order request not found." };

    const keepSkus = new Set(
      items.flatMap((i) => expandQuoteItemSkus(i as Record<string, unknown>)),
    );
    const removedSkus = before.items
      .flatMap((it) => expandQuoteItemSkus(it))
      .filter((sku) => !keepSkus.has(sku));

    await updateQuoteItems(id, items, session.email);

    if (removedSkus.length) {
      try {
        await releaseQuoteHoldsForSkus(id, removedSkus);
      } catch (err) {
        console.warn(
          "[saveQuoteLineItems] hold release:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    revalidatePath("/wholesaleportal/rep");
    revalidatePath(`/wholesaleportal/rep/quotes/${id}`);
    return { ok: true, message: "Order request updated." };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not update order request.",
    };
  }
}
