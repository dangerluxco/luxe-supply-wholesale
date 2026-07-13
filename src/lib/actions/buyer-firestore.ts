"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { getCatalogProductBySku } from "@/lib/firestore/catalog";
import {
  cartHoldSkus,
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
export async function submitInvoiceRequest(message?: string) {
  const session = await getSession();
  if (!session || session.role !== "BUYER" || session.source !== "firestore") {
    return { error: "Sign in required." };
  }

  const buyer = await getBuyerById(session.id);
  if (!buyer) return { error: "Buyer account not found." };

  const cart = await getBuyerCart(session.id);
  if (!cart.length) return { error: "Your order is empty." };

  const holdSkus = cartHoldSkus(cart);
  const { id } = await createBuyerQuote({ buyer, items: cart, message });
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

  revalidatePath("/wholesale");
  revalidatePath("/wholesale/cart");
  revalidatePath("/wholesaleportal/rep");
  return { ok: true, quoteId: id };
}
