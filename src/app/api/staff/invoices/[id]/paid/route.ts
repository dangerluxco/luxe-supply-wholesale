import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { FIRESTORE_INVOICE_STATUS } from "@/lib/constants";
import { updateInvoiceStatus } from "@/lib/firestore/invoices";

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
    await updateInvoiceStatus(invoiceId.trim(), FIRESTORE_INVOICE_STATUS.PAID, session.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update invoice." },
      { status: 400 },
    );
  }
}
