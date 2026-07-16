"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { markInvoiceShipped } from "@/lib/firestore/invoices";

/** Thin entry for InvoiceFulfillmentForm — soft-nav safe. */
export async function markInvoiceShippedAction(
  _prev: { error?: string; message?: string } | undefined,
  formData: FormData,
) {
  try {
    const session = await getSession();
    if (
      !session ||
      session.source !== "firestore" ||
      (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
    ) {
      return { error: "Staff session required." };
    }
    const invoiceId = String(formData.get("invoiceId") || "").trim();
    const carrier = String(formData.get("carrier") || "").trim();
    const trackingNumber = String(formData.get("trackingNumber") || "").trim();
    if (!invoiceId) return { error: "Missing invoice id." };
    if (!carrier) return { error: "Select a carrier." };

    await markInvoiceShipped(invoiceId, { carrier, trackingNumber }, session.email);
    revalidatePath(`/wholesaleportal/rep/invoices/${invoiceId}`);
    revalidatePath("/wholesaleportal/rep/invoices");
    revalidatePath("/wholesale/invoices");
    return { ok: true, message: "Marked shipped." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not mark shipped." };
  }
}
