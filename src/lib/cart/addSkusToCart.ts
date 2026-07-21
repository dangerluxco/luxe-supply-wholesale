import { revalidatePath } from "next/cache";
import { getCatalogProductBySku } from "@/lib/firestore/catalog";
import {
  cartHoldSkus,
  cartLimitError,
  getBuyerById,
  getBuyerCart,
  setBuyerCart,
  type CartItem,
} from "@/lib/firestore/buyers";
import { findSkusHeldByOthers, syncCartHolds } from "@/lib/firestore/holds";
import { listActiveBundledSkus } from "@/lib/firestore/suggestedLots";
import type { SessionUser } from "@/lib/auth";

export type AddSkusToCartResult =
  | { ok: true; added: number; skipped: number }
  | { error: string; added?: number; skipped?: number };

/** Core add-to-cart logic shared by the buyer API route (and thin server actions). */
export async function addSkusToCartForBuyer(
  session: SessionUser,
  skus: string[],
): Promise<AddSkusToCartResult> {
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
  revalidatePath("/wholesale", "layout");
  return { ok: true, added: added.length, skipped: skipped.length };
}
