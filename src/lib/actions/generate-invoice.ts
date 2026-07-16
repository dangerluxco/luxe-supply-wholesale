"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { createInvoiceFromQuote } from "@/lib/firestore/invoices";

/**
 * Thin entry for GenerateInvoiceButton — isolated from invoices.ts soft-nav stubs.
 */
export async function generateInvoiceFromQuote(quoteId: string) {
  try {
    const session = await getSession();
    if (
      !session ||
      session.source !== "firestore" ||
      (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
    ) {
      return { error: "Staff session required." };
    }
    const invoice = await createInvoiceFromQuote(quoteId, session.email);
    revalidatePath(`/wholesaleportal/rep/quotes/${quoteId}`);
    revalidatePath("/wholesaleportal/rep/invoices");
    revalidatePath("/wholesaleportal/rep");
    revalidatePath("/wholesale/invoices");
    revalidatePath("/wholesale/orders");
    return { ok: true, invoiceId: invoice.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate invoice." };
  }
}
