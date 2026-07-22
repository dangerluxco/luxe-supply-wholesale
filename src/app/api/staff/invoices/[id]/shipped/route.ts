import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { markInvoiceShipped } from "@/lib/firestore/invoices";
import { logAudit } from "@/lib/firestore/audit";
import { sendShippedEmail } from "@/lib/notify";
import { trackingUrlFor } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
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

  const body = (await request.json().catch(() => ({}))) as {
    carrier?: string;
    trackingNumber?: string;
  };
  const carrier = String(body.carrier || "").trim();
  const trackingNumber = String(body.trackingNumber || "").trim();
  if (!carrier) {
    return NextResponse.json({ error: "Select a carrier." }, { status: 400 });
  }

  try {
    const invoice = await markInvoiceShipped(
      invoiceId.trim(),
      { carrier, trackingNumber },
      session.email,
    );
    await logAudit({
      actor: session,
      action: "invoice.shipped",
      entity: "invoice",
      entityId: invoiceId.trim(),
      payload: { carrier, trackingNumber },
    });
    // Buyer shipped email with tracking link — non-blocking.
    try {
      if (invoice?.customerEmail) {
        await sendShippedEmail({
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          customerEmail: invoice.customerEmail,
          carrier,
          trackingNumber,
          trackingUrl: trackingUrlFor(carrier, trackingNumber),
        });
      }
    } catch (err) {
      console.warn("[invoice shipped] email failed:", err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ ok: true, message: "Marked shipped." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not mark shipped." },
      { status: 400 },
    );
  }
}
