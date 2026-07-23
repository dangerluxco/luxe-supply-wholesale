import "server-only";
import Stripe from "stripe";

/**
 * Stripe server client — online payment of portal invoices via hosted Checkout.
 *
 * Config-gated like Resend/ShipEngine: without STRIPE_SECRET_KEY the "Pay
 * online" button never renders and buyers keep paying by wire, so nothing
 * breaks on deployments that haven't set keys yet. Hosted Checkout means no
 * publishable key or Stripe.js ever loads in our pages (and no CSP changes).
 *
 * Key guidance (Stripe best practices): prefer a RESTRICTED key (rk_...) over
 * a full secret key — this integration only needs Checkout Sessions write.
 */
const STRIPE_API_VERSION = "2026-06-24.dahlia" as Stripe.LatestApiVersion;

/** Dashboard label for sessions created by this integration (fixed suffix). */
export const STRIPE_INTEGRATION_IDENTIFIER = "luxe_wholesale_invoice_pay_kqzvwmrt";

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!String(process.env.STRIPE_SECRET_KEY || "").trim();
}

export function getStripe(): Stripe {
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY).");
  if (!client) {
    client = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return client;
}

export function getStripeWebhookSecret(): string {
  return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}
