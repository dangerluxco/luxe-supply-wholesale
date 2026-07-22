import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { FIRESTORE_INVOICE_STATUS } from "@/lib/constants";
import { updateInvoiceStatus } from "@/lib/firestore/invoices";
import { logAudit } from "@/lib/firestore/audit";
import { sendPaymentReceiptEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id: invoiceId } = await ctx.params;
  if (!invoiceId?.trim()) {
    return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });
  }

  try {
    const invoice = await updateInvoiceStatus(
      invoiceId.trim(),
      FIRESTORE_INVOICE_STATUS.PAID,
      session.email,
    );
    await logAudit({
      actor: session,
      action: "invoice.paid",
      entity: "invoice",
      entityId: invoiceId.trim(),
    });
    // Buyer receipt — non-blocking, no-op until Resend is configured.
    try {
      if (invoice?.customerEmail) {
        await sendPaymentReceiptEmail({
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          customerEmail: invoice.customerEmail,
          total: invoice.total,
        });
      }
    } catch (err) {
      console.warn("[invoice paid] receipt email failed:", err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update invoice." },
      { status: 400 },
    );
  }
}
