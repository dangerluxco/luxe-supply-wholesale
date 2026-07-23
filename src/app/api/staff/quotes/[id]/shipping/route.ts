import { addQuoteActivity } from "@/lib/firestore/quoteActivities";
import { logAudit } from "@/lib/firestore/audit";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getQuoteById, updateQuoteShipping } from "@/lib/firestore/quotes";
import { getShippingRules } from "@/lib/firestore/settings";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (
    !session ||
    session.source !== "firestore" ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id } = await params;
  const quoteId = String(id || "").trim();
  if (!quoteId) {
    return NextResponse.json({ error: "Missing order request." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { methodId?: string } | null;
  const methodId = String(body?.methodId || "").trim();
  if (!methodId) {
    return NextResponse.json({ error: "Missing shipping method." }, { status: 400 });
  }

  try {
    const [quote, rules] = await Promise.all([getQuoteById(quoteId), getShippingRules()]);
    if (!quote) {
      return NextResponse.json({ error: "Order request not found." }, { status: 404 });
    }
    if (quote.invoiceId) {
      return NextResponse.json(
        { error: "An invoice was already generated — its shipping is locked in." },
        { status: 409 },
      );
    }

    // Full configured list, not just buyer-enabled — staff may apply a method
    // that's hidden from checkout (e.g. white glove reserved for reps).
    const method = rules.methods.find((m) => m.id === methodId);
    if (!method) {
      return NextResponse.json({ error: "Unknown shipping method." }, { status: 400 });
    }

    // Same comp rule as checkout, against the request's current merchandise total.
    const subtotal = Math.max(0, Math.round(quote.cartTotal || 0));
    const threshold = rules.freeShippingThreshold;
    const comped = threshold > 0 && method.compEligible && subtotal >= threshold;

    await updateQuoteShipping(
      quoteId,
      {
        methodId: method.id,
        label: method.label,
        amount: comped ? 0 : method.price,
        comp: comped ? { applied: true, threshold, baseFee: method.price } : null,
      },
      session.email,
    );

    await addQuoteActivity({
      quoteId,
      type: "shipping_edited",
      text: `Shipping changed to ${method.label} — ${comped ? "free (comped)" : money(method.price)}`,
      staffEmail: session.email,
      staffName: session.name || session.email,
    }).catch(() => {});
    await logAudit({
      actor: session,
      action: "quote.shipping_edited",
      entity: "quote",
      entityId: quoteId,
      payload: { methodId: method.id, price: method.price, comped },
    });
    return NextResponse.json({ ok: true, message: "Shipping updated." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update shipping." },
      { status: 400 },
    );
  }
}
