import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { recordInvoicePayment } from "@/lib/firestore/invoices";
import { logAudit } from "@/lib/firestore/audit";
import { sendPaymentReceiptEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** Record a (possibly partial) payment. Emails the buyer a receipt when the balance clears. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const invoiceId = String(id || "").trim();
  if (!invoiceId) {
    return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    amount?: number;
    method?: string;
    reference?: string;
    note?: string;
  };

  try {
    const { invoice, fullyPaid } = await recordInvoicePayment(
      invoiceId,
      {
        amount: Number(body.amount),
        method: body.method,
        reference: body.reference,
        note: body.note,
      },
      session.email,
    );
    await logAudit({
      actor: session,
      action: "invoice.payment",
      entity: "invoice",
      entityId: invoiceId,
      payload: { amount: Number(body.amount), method: body.method || "wire", fullyPaid },
    });
    if (fullyPaid && invoice.customerEmail) {
      try {
        await sendPaymentReceiptEmail({
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          customerEmail: invoice.customerEmail,
          total: invoice.total,
        });
      } catch (err) {
        console.warn("[invoice payment] receipt email failed:", err instanceof Error ? err.message : err);
      }
    }
    return NextResponse.json({ ok: true, fullyPaid, balance: invoice.balance });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not record payment." },
      { status: 400 },
    );
  }
}
