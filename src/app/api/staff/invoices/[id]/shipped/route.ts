import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { markInvoiceShipped } from "@/lib/firestore/invoices";

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
    await markInvoiceShipped(invoiceId.trim(), { carrier, trackingNumber }, session.email);
    return NextResponse.json({ ok: true, message: "Marked shipped." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not mark shipped." },
      { status: 400 },
    );
  }
}
