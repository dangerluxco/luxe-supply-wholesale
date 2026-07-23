import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { createInvoiceFromQuote } from "@/lib/firestore/invoices";
import { getOrCreateFulfillment } from "@/lib/firestore/fulfillment";
import { addQuoteActivity } from "@/lib/firestore/quoteActivities";
import { logAudit } from "@/lib/firestore/audit";
import { sendInvoiceReadyEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (
    !session ||
    session.source !== "firestore" ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id } = await params;
  const quoteId = String(id || "").trim();
  if (!quoteId) {
    return NextResponse.json({ error: "Missing order request." }, { status: 400 });
  }

  try {
    const invoice = await createInvoiceFromQuote(quoteId, session.email);
    // Create the pack-and-ship record now (not lazily on first pack-station
    // open) so the order lands in the fulfillment queue fully seeded the moment
    // the invoice exists. Non-blocking: the queue also lists UNFULFILLED
    // invoices without a record, and the pack station still creates on demand.
    try {
      await getOrCreateFulfillment(invoice.id);
    } catch (err) {
      console.warn(
        "[generate-invoice] fulfillment record create failed:",
        err instanceof Error ? err.message : err,
      );
    }
    await addQuoteActivity({
      quoteId,
      type: "invoice_generated",
      text: `Invoice ${invoice.invoiceNumber} generated (${invoice.itemCount} items)`,
      staffEmail: session.email,
      staffName: session.name || session.email,
    }).catch(() => {});
    await logAudit({
      actor: session,
      action: "invoice.generated",
      entity: "invoice",
      entityId: invoice.id,
      payload: { invoiceNumber: invoice.invoiceNumber, quoteId },
    });
    // Buyer "invoice ready" email — non-blocking, no-op until Resend is configured.
    try {
      if (invoice.customerEmail) {
        await sendInvoiceReadyEmail({
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          customerEmail: invoice.customerEmail,
          total: invoice.total,
          dueDate: invoice.dueDate,
          terms: invoice.terms,
        });
      }
    } catch (err) {
      console.warn("[generate-invoice] buyer email failed:", err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ ok: true, invoiceId: invoice.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not generate invoice." },
      { status: 400 },
    );
  }
}
