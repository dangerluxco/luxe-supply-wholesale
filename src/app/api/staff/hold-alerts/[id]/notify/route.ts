import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getHoldAlertById, markHoldAlertNotified } from "@/lib/firestore/holdAlerts";
import { getCatalogProductsBySkus } from "@/lib/firestore/catalog";
import { sendBackInStockEmail } from "@/lib/notify";
import { isEmailConfigured } from "@/lib/email";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

/**
 * Staff-triggered "it's available again" email for a wishlist (hold-alert) row.
 * Re-checks availability server-side so a stale page can't email a buyer about
 * a piece that's already sold or re-held.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "Email isn't configured yet (RESEND_API_KEY). The buyer was not notified." },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const alert = await getHoldAlertById(String(id || "").trim());
  if (!alert) {
    return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  }
  if (!alert.buyerEmail) {
    return NextResponse.json({ error: "This buyer has no email on file." }, { status: 400 });
  }

  const products = await getCatalogProductsBySkus([alert.sku]);
  const product = products.get(alert.sku);
  if (!product || product.soldOut || product.held) {
    return NextResponse.json(
      { error: "That piece isn't available right now — no email sent." },
      { status: 409 },
    );
  }

  const sent = await sendBackInStockEmail({
    customerName: alert.buyerDisplayName,
    customerEmail: alert.buyerEmail,
    sku: alert.sku,
    title: alert.title,
    brand: alert.brand || undefined,
  });
  if (!sent) {
    return NextResponse.json({ error: "Email send failed — try again." }, { status: 502 });
  }

  await markHoldAlertNotified(alert.id, session.email);
  await logAudit({
    actor: session,
    action: "wishlist.notified",
    entity: "holdAlert",
    entityId: alert.id,
    payload: { sku: alert.sku, buyer: alert.portalUsername },
  });
  return NextResponse.json({ ok: true });
}
