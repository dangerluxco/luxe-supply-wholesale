import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import {
  getCurationShareForStaff,
  linkCurationShareToBuyer,
  markCurationCallRequested,
} from "@/lib/firestore/curation";
import { getBuyerById } from "@/lib/firestore/buyers";
import { buyerStorefrontOrigin, sendCurationCallRequestEmail } from "@/lib/notify";
import { isEmailConfigured } from "@/lib/email";
import { curationCallRequestDraft } from "@/lib/callRequestDraft";

export const dynamic = "force-dynamic";

/**
 * "Request a call" for an ad-hoc curation share: emails the buyer asking for a
 * few times that work (reply-to the rep), with the buyer curation URL in the
 * message. Supports `{ preview: true }` to return a draft without sending, and
 * optional `subject` / `body` overrides from the staff review modal.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    buyerId?: string;
    preview?: boolean;
    subject?: string;
    body?: string;
  };
  const share = await getCurationShareForStaff(token);
  if (!share) {
    return NextResponse.json({ error: "This curation link is unavailable." }, { status: 404 });
  }
  if (share.revoked) {
    return NextResponse.json({ error: "This curation link has been revoked." }, { status: 400 });
  }

  const buyerId = String(body.buyerId || share.linkedBuyerId || "").trim();
  if (!buyerId) {
    return NextResponse.json(
      { error: "Pick a portal buyer first — call requests need their email." },
      { status: 400 },
    );
  }

  const buyer = await getBuyerById(buyerId);
  if (!buyer) {
    return NextResponse.json({ error: "Buyer not found." }, { status: 404 });
  }
  if (!buyer.email) {
    return NextResponse.json(
      { error: "This buyer has no email on file — add one before requesting a call." },
      { status: 400 },
    );
  }

  if (share.linkedBuyerId !== buyerId) {
    try {
      await linkCurationShareToBuyer(token, buyerId);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not link buyer." },
        { status: 400 },
      );
    }
  }

  const customerName = buyer.displayName || buyer.username || share.clientName || "";
  const estimatedTotal = share.items.length
    ? share.items.reduce((sum, it) => sum + it.price, 0)
    : null;
  const curationUrl = `${buyerStorefrontOrigin()}/curation/${token}`;
  const draft = curationCallRequestDraft({
    customerName,
    curationUrl,
    itemCount: share.items.length,
    estimatedTotal,
    staffName: session.name,
  });
  const subject = String(body.subject || "").trim() || draft.subject;
  const bodyText = String(body.body || "").trim() || draft.body;

  if (body.preview) {
    return NextResponse.json({
      ok: true,
      preview: true,
      to: buyer.email,
      subject: draft.subject,
      body: draft.body,
    });
  }

  const requestedAt = new Date().toISOString();

  try {
    if (isEmailConfigured()) {
      const sent = await sendCurationCallRequestEmail({
        token,
        curationUrl,
        customerName,
        customerEmail: buyer.email,
        itemCount: share.items.length,
        estimatedTotal,
        clientLabel: share.clientName || undefined,
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
      await markCurationCallRequested(token);
      return NextResponse.json({ ok: true, sent: true, requestedAt });
    }

    // Dev / no SendGrid: hand back a prefilled draft instead.
    const mailto = `mailto:${encodeURIComponent(buyer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    await markCurationCallRequested(token);
    return NextResponse.json({ ok: true, sent: false, mailto, requestedAt });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send the call request." },
      { status: 400 },
    );
  }
}
