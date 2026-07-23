"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { QUOTE_STATUSES } from "@/lib/constants";
import { updateQuoteStatus } from "@/lib/firestore/quotes";
import { releaseAllHoldsForQuote } from "@/lib/firestore/holds";

/** Thin entry for QuoteStatusSelect — isolated from portal.ts soft-nav stubs. */
export async function setQuoteStatus(quoteId: string, status: string) {
  const session = await getSession();
  if (!session || session.source !== "firestore") {
    return { error: "Staff session required." };
  }
  const next = String(status || "").toLowerCase();
  if (!(QUOTE_STATUSES as readonly string[]).includes(next)) {
    return { error: "Invalid status." };
  }
  // Manual "quoted" (Invoiced) is blocked: it sells out the SKUs without an
  // invoice document. Generate invoice is the only path to Invoiced.
  if (next === "quoted") {
    return { error: "Use Generate invoice — it creates the invoice and marks the items sold." };
  }
  await updateQuoteStatus(quoteId, { status: next }, session.email);

  if (next === "declined" || next === "timed_out" || next === "closed") {
    try {
      await releaseAllHoldsForQuote(quoteId);
    } catch (err) {
      console.warn("[setQuoteStatus] release holds:", err);
    }
  }

  revalidatePath("/wholesaleportal/rep");
  revalidatePath(`/wholesaleportal/rep/quotes/${quoteId}`);
  revalidatePath("/wholesale");
  return { ok: true };
}
