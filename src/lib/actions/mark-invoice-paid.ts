"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE, FIRESTORE_INVOICE_STATUS } from "@/lib/constants";
import { updateInvoiceStatus } from "@/lib/firestore/invoices";

/** Thin entry for InvoiceMarkPaidButton — soft-nav safe. */
export async function markInvoicePaid(invoiceId: string) {
  try {
    const session = await getSession();
    if (
      !session ||
      session.source !== "firestore" ||
      (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
    ) {
      return { error: "Staff session required." };
    }
    await updateInvoiceStatus(invoiceId, FIRESTORE_INVOICE_STATUS.PAID, session.email);
    revalidatePath(`/wholesaleportal/rep/invoices/${invoiceId}`);
    revalidatePath("/wholesaleportal/rep/invoices");
    revalidatePath("/wholesale/invoices");
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update invoice." };
  }
}
