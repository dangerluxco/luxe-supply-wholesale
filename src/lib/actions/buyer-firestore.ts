"use server";

import { revalidatePath } from "next/cache";
import { getSessionForArea } from "@/lib/auth";
import {
  cartHoldSkus,
  createBuyerQuote,
  getBuyerById,
  getBuyerCart,
  setBuyerCart,
} from "@/lib/firestore/buyers";
import { convertCartHoldsToQuote, syncCartHolds } from "@/lib/firestore/holds";
import { getQuoteThresholds, evaluateQuoteThresholds } from "@/lib/firestore/settings";
import { getDb } from "@/lib/firestore/admin";
import { notifyStaffOfInvoiceRequest } from "@/lib/notify";
import { resolveShippingOption } from "@/lib/constants";
import { addSkusToCartForBuyer } from "@/lib/cart/addSkusToCart";

async function requireBuyer() {
  const session = await getSessionForArea("buyer");
  if (!session || session.role !== "BUYER" || session.source !== "firestore") return null;
  return session;
}

export async function addSkuToCart(sku: string) {
  return addSkusToCart([sku]);
}

/** @deprecated Prefer POST /api/buyer/cart/add from client components. */
export async function addSkusToCart(skus: string[]) {
  const session = await requireBuyer();
  if (!session) return { error: "Sign in required." };
  return addSkusToCartForBuyer(session, skus);
}

export async function removeSkuFromCart(sku: string) {
  const session = await requireBuyer();
  if (!session) return;

  const cart = await getBuyerCart(session.id);
  const next = cart.filter((i) => i.sku !== sku);
  await setBuyerCart(session.id, next);
  await syncCartHolds({
    username: session.username || "",
    displayName: session.name,
    skus: cartHoldSkus(next),
  });

  revalidatePath("/wholesale");
  revalidatePath("/wholesale/cart");
  // Keep the persistent topbar Checkout button's live count/total in sync everywhere.
  revalidatePath("/wholesale", "layout");
}

/**
 * Buyer submits their cart to be invoiced. This still writes to the Firestore
 * `salesPortalQuotes` collection (kept as-is to avoid breaking existing data /
 * the staff queue), but the buyer- and staff-facing product is an "invoice
 * request" — not a price quote. Staff review/approve → formal invoice comes later.
 */
export async function submitInvoiceRequest(opts?: {
  message?: string;
  shippingMethodId?: string;
}) {
  const session = await requireBuyer();
  if (!session) {
    return { error: "Sign in required." };
  }

  const buyer = await getBuyerById(session.id);
  if (!buyer) return { error: "Buyer account not found." };

  const cart = await getBuyerCart(session.id);
  if (!cart.length) return { error: "Your order is empty." };

  // Configurable minimum item count / order total (staff: /wholesaleportal/rep/settings).
  const itemCount = cart.length;
  const cartTotal = cart.reduce((s, i) => s + (Number(i.price) || 0), 0);
  const shipping = resolveShippingOption(opts?.shippingMethodId);
  const thresholds = await getQuoteThresholds();
  const thresholdCheck = evaluateQuoteThresholds(thresholds, {
    itemCount,
    cartTotal,
    pricedItemCount: itemCount,
  });
  if (!thresholdCheck.met) {
    return { error: thresholdCheck.message };
  }

  const holdSkus = cartHoldSkus(cart);
  const message = opts?.message;
  const { id } = await createBuyerQuote({
    buyer,
    items: cart,
    message,
    shippingMethodId: shipping.id,
    shippingLabel: shipping.label,
    shipping: shipping.price,
  });
  await setBuyerCart(session.id, []);
  try {
    await convertCartHoldsToQuote({
      username: session.username || buyer.username,
      displayName: session.name || buyer.displayName,
      skus: holdSkus,
      quoteId: id,
    });
  } catch (err) {
    console.warn("[submitInvoiceRequest] hold convert:", err instanceof Error ? err.message : err);
  }

  // Notify staff by email. Never blocks/fails the submit — the invoice request
  // is already created above regardless of email outcome.
  try {
    const { sent, recipients } = await notifyStaffOfInvoiceRequest({
      quoteId: id,
      customerName: buyer.displayName || buyer.username,
      customerEmail: buyer.email,
      customerCompany: buyer.company,
      customerPhone: buyer.phone,
      message,
      items: cart.map((i) => ({ sku: i.sku, title: i.title, brand: i.brand, price: i.price })),
      itemCount,
      cartTotal,
      shippingLabel: shipping.label,
      shipping: shipping.price,
    });
    if (sent) {
      await getDb()
        .collection("salesPortalQuotes")
        .doc(id)
        .update({ emailSent: true, emailRecipients: recipients })
        .catch(() => {});
    }
  } catch (err) {
    console.error(
      "[submitInvoiceRequest] staff email notify failed:",
      err instanceof Error ? err.message : err,
    );
  }

  revalidatePath("/wholesale");
  revalidatePath("/wholesale/cart");
  // Keep the persistent topbar Checkout button's live count/total in sync everywhere.
  revalidatePath("/wholesale", "layout");
  revalidatePath("/wholesaleportal/rep");
  return { ok: true, quoteId: id };
}
