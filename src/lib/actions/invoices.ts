"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE, FIRESTORE_INVOICE_STATUS } from "@/lib/constants";
import {
  createInvoiceFromQuote,
  markInvoiceShipped,
  updateInvoiceStatus,
} from "@/lib/firestore/invoices";

async function requireStaff() {
  const session = await getSession();
  if (
    !session ||
    session.source !== "firestore" ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    throw new Error("Staff session required.");
  }
  return session;
}

/** Staff turns a priced invoice request into a formal invoice. */
export async function generateInvoiceFromQuote(quoteId: string) {
  try {
    const session = await requireStaff();
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

export async function markInvoicePaid(invoiceId: string) {
  try {
    const session = await requireStaff();
    await updateInvoiceStatus(invoiceId, FIRESTORE_INVOICE_STATUS.PAID, session.email);
    revalidatePath(`/wholesaleportal/rep/invoices/${invoiceId}`);
    revalidatePath("/wholesaleportal/rep/invoices");
    revalidatePath("/wholesale/invoices");
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update invoice." };
  }
}

export async function markInvoiceShippedAction(
  _prev: { error?: string; message?: string } | undefined,
  formData: FormData,
) {
  try {
    const session = await requireStaff();
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
