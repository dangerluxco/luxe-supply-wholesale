import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, getStripeWebhookSecret, isStripeConfigured } from "@/lib/stripe";
import { getInvoiceById, recordInvoicePayment } from "@/lib/firestore/invoices";
import { notifyStaffOfOnlinePayment, sendPaymentReceiptEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the single source of truth for online payments. Register in
 * the Stripe Dashboard as  https://<host>/api/stripe/webhook  with events:
 *   checkout.session.completed
 *   checkout.session.async_payment_succeeded   (ACH and other delayed methods)
 *   checkout.session.async_payment_failed
 * and set the endpoint's signing secret as STRIPE_WEBHOOK_SECRET.
 *
 * Signature verification happens over the RAW request body (never re-serialize
 * the parsed JSON). Idempotent: a payment_intent already recorded on the
 * invoice's payments list is skipped, so Stripe's retries can't double-pay.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }
  const secret = getStripeWebhookSecret();
  if (!secret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting event.");
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature") || "";
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(rawBody, signature, secret);
  } catch (err) {
    console.warn("[stripe webhook] signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        // completed fires even for delayed methods still processing — only
        // record once Stripe says the money is actually collected.
        if (session.payment_status !== "paid") break;
        await recordCheckoutPayment(session);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const invoiceNumber = session.metadata?.invoiceNumber || "?";
        console.warn(`[stripe webhook] async payment FAILED for invoice ${invoiceNumber}`);
        await notifyStaffOfOnlinePayment({
          invoiceNumber,
          invoiceId: String(session.metadata?.invoiceId || session.client_reference_id || ""),
          buyerName: session.customer_details?.name || session.customer_email || "A buyer",
          amount: (session.amount_total ?? 0) / 100,
          fullyPaid: false,
          remainingBalance: 0,
          failed: true,
        }).catch(() => {});
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Non-2xx makes Stripe retry with backoff — correct for transient Firestore
    // failures; the idempotency check above makes retries safe.
    console.error("[stripe webhook] handler failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function recordCheckoutPayment(session: Stripe.Checkout.Session): Promise<void> {
  const invoiceId = String(session.metadata?.invoiceId || session.client_reference_id || "").trim();
  if (!invoiceId) {
    console.warn("[stripe webhook] completed session with no invoiceId metadata:", session.id);
    return;
  }
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || session.id;

  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    console.warn(`[stripe webhook] invoice ${invoiceId} not found for session ${session.id}`);
    return;
  }
  // Idempotency: Stripe retries + completed/async_succeeded can both arrive.
  if (invoice.payments.some((p) => p.reference === paymentIntentId)) return;
  if (invoice.status === "PAID") return;

  const amount = (session.amount_total ?? 0) / 100;
  if (!(amount > 0)) return;

  const { invoice: updated, fullyPaid } = await recordInvoicePayment(
    invoiceId,
    {
      amount,
      method: "stripe",
      reference: paymentIntentId,
      note: "Paid online via Stripe Checkout",
    },
    "stripe:webhook",
  );

  // Emails are best-effort and no-op until Resend is configured — the payment
  // record above is the source of truth either way.
  await notifyStaffOfOnlinePayment({
    invoiceNumber: updated.invoiceNumber,
    invoiceId: updated.id,
    buyerName: updated.customerName || updated.portalUsername,
    amount,
    fullyPaid,
    remainingBalance: updated.balance,
  }).catch(() => {});
  if (fullyPaid && updated.customerEmail) {
    await sendPaymentReceiptEmail({
      invoiceNumber: updated.invoiceNumber,
      customerName: updated.customerName,
      customerEmail: updated.customerEmail,
      total: updated.total,
    }).catch(() => {});
  }
}
