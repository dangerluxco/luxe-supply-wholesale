"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { getCatalogProductBySku } from "@/lib/firestore/catalog";
import {
  cartHoldSkus,
  cartLimitError,
  createBuyerQuote,
  getBuyerById,
  getBuyerCart,
  setBuyerCart,
  type CartItem,
} from "@/lib/firestore/buyers";
import {
  convertCartHoldsToQuote,
  findSkusHeldByOthers,
  syncCartHolds,
} from "@/lib/firestore/holds";
import { listActiveBundledSkus } from "@/lib/firestore/suggestedLots";
import { getQuoteThresholds, evaluateQuoteThresholds } from "@/lib/firestore/settings";
import { getDb } from "@/lib/firestore/admin";
import { notifyStaffOfInvoiceRequest } from "@/lib/notify";
import { resolveShippingOption } from "@/lib/constants";

export async function addSkuToCart(sku: string) {
  return addSkusToCart([sku]);
}

export async function addSkusToCart(skus: string[]) {
  const session = await getSession();
  if (!session || session.role !== "BUYER" || session.source !== "firestore") {
    return { error: "Sign in required." };
  }

  const unique = [...new Set(skus.map((s) => String(s || "").trim()).filter(Boolean))];
  if (!unique.length) return { error: "No pieces selected." };

  const username = session.username || "";
  const bundled = await listActiveBundledSkus();
  const inBundle = unique.filter((s) => bundled.has(s.toUpperCase()));
  if (inBundle.length) {
    return {
      error: `In an active suggested lot (not sold individually): ${inBundle
        .slice(0, 6)
        .join(", ")}${inBundle.length > 6 ? "…" : ""}`,
    };
  }

  const blocked = await findSkusHeldByOthers(unique, username);
  if (blocked.length) {
    return {
      error: `On hold for another buyer: ${blocked.slice(0, 6).join(", ")}${
        blocked.length > 6 ? "…" : ""
      }`,
    };
  }

  const cart = await getBuyerCart(session.id);
  const existing = new Set(cart.map((i) => i.sku));
  const added: string[] = [];
  const skipped: string[] = [];
  const next: CartItem[] = [...cart];

  for (const sku of unique) {
    if (existing.has(sku)) {
      skipped.push(sku);
      continue;
    }
    const product = await getCatalogProductBySku(sku, { buyerUsername: username });
    if (!product || product.soldOut || product.held || product.price == null) {
      skipped.push(sku);
      continue;
    }
    next.push({
      sku: product.sku,
      title: product.title,
      brand: product.brand,
      price: Math.round(product.price),
      imageUrl: product.imageUrl,
      addedAt: new Date().toISOString(),
    });
    existing.add(product.sku);
    added.push(product.sku);
  }

  if (!added.length) {
    return {
      error: skipped.length
        ? "None of the selected pieces could be added (held, sold, or already in order)."
        : "Nothing to add.",
    };
  }

  const buyer = await getBuyerById(session.id);
  if (!buyer) return { error: "Buyer account not found." };
  const limitErr = cartLimitError(next, buyer);
  if (limitErr) return { error: limitErr };

  await setBuyerCart(session.id, next);
  await syncCartHolds({
    username,
    displayName: session.name,
    skus: cartHoldSkus(next),
  });

  revalidatePath("/wholesale");
  revalidatePath("/wholesale/cart");
  return { ok: true, added: added.length, skipped: skipped.length };
}

export async function removeSkuFromCart(sku: string) {
  const session = await getSession();
  if (!session || session.role !== "BUYER") return;

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
  const session = await getSession();
  if (!session || session.role !== "BUYER" || session.source !== "firestore") {
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
  revalidatePath("/wholesaleportal/rep");
  return { ok: true, quoteId: id };
}
