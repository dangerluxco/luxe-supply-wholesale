import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getQuoteById, markCallRequested } from "@/lib/firestore/quotes";
import { sendCallRequestEmail } from "@/lib/notify";
import { isEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * "Request a call": emails the buyer asking for a few times that work (reply-to
 * the rep), the precursor to Book Call. Without SENDGRID_API_KEY (local dev),
 * falls back to a prefilled mailto: draft the rep sends from their own client —
 * either way the request is stamped on the quote so the card shows when it went out.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id } = await params;
  const quote = await getQuoteById(id);
  if (!quote) return NextResponse.json({ error: "Order request not found." }, { status: 404 });
  if (!quote.customerEmail) {
    return NextResponse.json(
      { error: "This request has no buyer email on file." },
      { status: 400 },
    );
  }

  const customerName = quote.customerName || quote.buyerDisplayName || "";
  const orderTotal =
    quote.cartTotal != null ? Math.round(quote.cartTotal + (quote.shipping || 0)) : null;

  try {
    if (isEmailConfigured()) {
      const sent = await sendCallRequestEmail({
        quoteId: quote.id,
        customerName,
        customerEmail: quote.customerEmail,
        itemCount: quote.itemCount || quote.items.length,
        orderTotal,
        staffName: session.name,
        staffEmail: session.email,
      });
      if (!sent) {
        return NextResponse.json(
          { error: "Email provider rejected the send. Try again or email the buyer directly." },
          { status: 502 },
        );
      }
      await markCallRequested(quote.id);
      return NextResponse.json({ ok: true, sent: true, requestedAt: new Date().toISOString() });
    }

    // Dev / no SendGrid: hand back a prefilled draft instead.
    const firstName = customerName.trim().split(/\s+/)[0] || "there";
    const subject = "Let's schedule a call about your order — Luxe Supply Co.";
    const body = [
      `Hi ${firstName},`,
      "",
      `Thanks for your order request${orderTotal != null ? ` ($${orderTotal.toLocaleString("en-US")})` : ""}. We'd love to hop on a quick call to walk through the pieces together and finalize your order.`,
      "",
      "Just reply with a few times that work for you and we'll send over a calendar invite.",
      "",
      `${session.name}`,
      "Luxe Supply Co.",
    ].join("\n");
    const mailto = `mailto:${encodeURIComponent(quote.customerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await markCallRequested(quote.id);
    return NextResponse.json({ ok: true, sent: false, mailto, requestedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send the call request." },
      { status: 400 },
    );
  }
}
