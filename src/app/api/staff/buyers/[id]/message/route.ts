import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getBuyerById } from "@/lib/firestore/buyers";
import { sendBuyerMessageEmail } from "@/lib/notify";
import { isEmailConfigured } from "@/lib/email";
import { buyerMessageDraft } from "@/lib/buyerMessageDraft";

export const dynamic = "force-dynamic";

/**
 * Staff "Message buyer": emails the buyer with reply-to the staff user.
 * Supports `{ preview: true }` for the draft modal, and optional `subject` /
 * `body` overrides. Without RESEND_API_KEY, falls back to mailto.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id } = await params;
  const buyer = await getBuyerById(id);
  if (!buyer) return NextResponse.json({ error: "Buyer not found." }, { status: 404 });
  if (!buyer.email?.trim()) {
    return NextResponse.json({ error: "This buyer has no email on file." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    preview?: boolean;
    subject?: string;
    body?: string;
  };

  const draft = buyerMessageDraft({
    buyerName: buyer.displayName || buyer.username,
    staffName: session.name,
    staffEmail: session.email,
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

  try {
    if (isEmailConfigured()) {
      const sent = await sendBuyerMessageEmail({
        buyerEmail: buyer.email,
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
      return NextResponse.json({ ok: true, sent: true });
    }

    const mailto = `mailto:${encodeURIComponent(buyer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    return NextResponse.json({ ok: true, sent: false, mailto });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send the message." },
      { status: 400 },
    );
  }
}
