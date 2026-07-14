"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { updateQuoteStatus } from "@/lib/firestore/quotes";

/** Thin entry for QuoteNotesForm — isolated from portal.ts soft-nav stubs. */
export async function saveQuoteNotes(
  _prev: { error?: string; message?: string } | undefined,
  formData: FormData,
) {
  const session = await getSession();
  if (!session || session.source !== "firestore") {
    return { error: "Staff session required." };
  }
  const quoteId = String(formData.get("quoteId") || "").trim();
  if (!quoteId) return { error: "Missing quote id." };
  const adminNotes = String(formData.get("adminNotes") || "");

  await updateQuoteStatus(quoteId, { adminNotes }, session.email);
  revalidatePath(`/wholesaleportal/rep/quotes/${quoteId}`);
  revalidatePath("/wholesaleportal/rep");
  return { ok: true, message: "Notes saved." };
}
