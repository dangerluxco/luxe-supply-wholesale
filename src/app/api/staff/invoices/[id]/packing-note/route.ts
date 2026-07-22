import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { setInvoicePackingNote } from "@/lib/firestore/invoices";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

/** Seller's note to the shipper for this order — shown on the pack station. */
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

  const body = (await request.json().catch(() => ({}))) as { note?: string };

  try {
    const invoice = await setInvoicePackingNote(
      invoiceId.trim(),
      String(body.note || ""),
      session.email,
    );
    await logAudit({
      actor: session,
      action: "invoice.packing_note",
      entity: "invoice",
      entityId: invoice.id,
      payload: { invoiceNumber: invoice.invoiceNumber, note: invoice.packingNote },
    });
    return NextResponse.json({ ok: true, packingNote: invoice.packingNote });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the note." },
      { status: 400 },
    );
  }
}
