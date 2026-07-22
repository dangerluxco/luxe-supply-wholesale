"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { createInvoiceFromQuote } from "@/lib/firestore/invoices";
import { sendInvoiceReadyEmail } from "@/lib/notify";
import { addQuoteActivity } from "@/lib/firestore/quoteActivities";

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
    await addQuoteActivity({
      quoteId,
      type: "invoice_generated",
      text: `Invoice ${invoice.invoiceNumber} generated (${invoice.itemCount} items)`,
      staffEmail: session.email,
      staffName: session.name || session.email,
    }).catch(() => {});
    // Buyer "invoice ready" email — non-blocking, no-op until Resend is configured.
    try {
      await sendInvoiceReadyEmail({
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        customerEmail: invoice.customerEmail,
        total: invoice.total,
        dueDate: invoice.dueDate,
        terms: invoice.terms,
      });
    } catch (err) {
      console.warn("[generate-invoice] buyer email failed:", err instanceof Error ? err.message : err);
    }
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
