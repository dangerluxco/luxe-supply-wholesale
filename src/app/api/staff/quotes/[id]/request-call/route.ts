import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getQuoteById, markCallRequested } from "@/lib/firestore/quotes";
import { buyerStorefrontOrigin, sendCallRequestEmail } from "@/lib/notify";
import { isEmailConfigured } from "@/lib/email";
import { quoteCallRequestDraft } from "@/lib/callRequestDraft";

export const dynamic = "force-dynamic";

/**
 * "Request a call": emails the buyer asking for a few times that work (reply-to
 * the rep). Supports `{ preview: true }` for the draft modal, and optional
 * `subject` / `body` overrides. Without SENDGRID_API_KEY, falls back to mailto.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    preview?: boolean;
    subject?: string;
    body?: string;
  };
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
  const orderUrl = `${buyerStorefrontOrigin()}/wholesale/orders/${quote.id}`;
  const draft = quoteCallRequestDraft({
    customerName,
    orderUrl,
    orderTotal,
    staffName: session.name,
  });
  const subject = String(body.subject || "").trim() || draft.subject;
  const bodyText = String(body.body || "").trim() || draft.body;

  if (body.preview) {
    return NextResponse.json({
      ok: true,
      preview: true,
      to: quote.customerEmail,
      subject: draft.subject,
      body: draft.body,
    });
  }

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
        subject,
        bodyText,
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
    const mailto = `mailto:${encodeURIComponent(quote.customerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    await markCallRequested(quote.id);
    return NextResponse.json({ ok: true, sent: false, mailto, requestedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send the call request." },
      { status: 400 },
    );
  }
}
