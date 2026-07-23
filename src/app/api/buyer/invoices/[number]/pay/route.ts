import { NextResponse } from "next/server";
import { requireBuyerSession } from "@/lib/buyer-api-auth";
import { getInvoiceByNumber } from "@/lib/firestore/invoices";
import { publicOrigin } from "@/lib/auth-session";
import {
  getStripe,
  isStripeConfigured,
  STRIPE_INTEGRATION_IDENTIFIER,
} from "@/lib/stripe";
import { FIRESTORE_INVOICE_STATUS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Buyer "Pay online": creates a Stripe Checkout Session for this invoice's
 * OUTSTANDING balance (partial wire payments already recorded reduce it) and
 * returns the hosted payment URL. The webhook — not the success redirect —
 * is what records the payment, so a closed tab can't lose a paid invoice.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const session = await requireBuyerSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Online payment isn't available yet — wire instructions are on the PDF." },
      { status: 503 },
    );
  }

  const { number } = await params;
  const invoice = await getInvoiceByNumber(decodeURIComponent(String(number || "")));
  // Same ownership rule as the invoice page: never act on another buyer's invoice.
  if (!invoice || invoice.portalUsername !== session.username) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (invoice.status === FIRESTORE_INVOICE_STATUS.PAID) {
    return NextResponse.json({ error: "This invoice is already paid in full." }, { status: 409 });
  }
  if (invoice.status === "DRAFT") {
    return NextResponse.json({ error: "This invoice hasn't been issued yet." }, { status: 409 });
  }
  const balance = Math.round(invoice.balance * 100) / 100;
  if (!(balance > 0)) {
    return NextResponse.json({ error: "No balance is due on this invoice." }, { status: 409 });
  }

  const origin = publicOrigin(request);
  const invoiceUrl = `${origin}/wholesale/invoices/${encodeURIComponent(invoice.invoiceNumber)}`;

  try {
    const stripe = getStripe();
    // NOTE: no payment_method_types — dynamic payment methods are managed from
    // the Stripe Dashboard (cards, ACH, Link, …) without code changes.
    const checkoutParams: Record<string, unknown> = {
      mode: "payment",
      client_reference_id: invoice.id,
      customer_email: invoice.customerEmail || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(balance * 100),
            product_data: {
              name: `Invoice ${invoice.invoiceNumber} — Luxe Supply Co. Wholesale`,
              description: `${invoice.itemCount} piece${invoice.itemCount === 1 ? "" : "s"} · ${invoice.terms}${
                invoice.amountPaid > 0 ? " · remaining balance" : ""
              }`,
            },
          },
        },
      ],
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        portalUsername: invoice.portalUsername,
      },
      payment_intent_data: {
        description: `Luxe Supply invoice ${invoice.invoiceNumber}`,
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
      },
      success_url: `${invoiceUrl}?paid=1`,
      cancel_url: invoiceUrl,
      integration_identifier: STRIPE_INTEGRATION_IDENTIFIER,
    };
    const checkout = await stripe.checkout.sessions.create(
      checkoutParams as unknown as Parameters<typeof stripe.checkout.sessions.create>[0],
    );
    if (!checkout.url) {
      return NextResponse.json({ error: "Stripe did not return a payment URL." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (err) {
    console.error("[invoice pay] checkout session failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Could not start the payment — try again or pay by wire." },
      { status: 502 },
    );
  }
}
