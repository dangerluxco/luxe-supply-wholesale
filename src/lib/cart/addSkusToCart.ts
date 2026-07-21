import { revalidatePath } from "next/cache";
import { getCatalogProductsBySkus } from "@/lib/firestore/catalog";
import {
  cartLimitError,
  getBuyerById,
  getBuyerCart,
  setBuyerCart,
  type CartItem,
} from "@/lib/firestore/buyers";
import { findSkusHeldByOthers, upsertPortalHolds } from "@/lib/firestore/holds";
import { listActiveBundledSkus } from "@/lib/firestore/suggestedLots";
import type { SessionUser } from "@/lib/auth";

export type AddSkusToCartResult =
  | { ok: true; added: number; skipped: number; cartCount: number; cartTotal: number }
  | { error: string; added?: number; skipped?: number };

/** Core add-to-cart logic shared by the buyer API route (and thin server actions). */
export async function addSkusToCartForBuyer(
  session: SessionUser,
  skus: string[],
): Promise<AddSkusToCartResult> {
  const unique = [...new Set(skus.map((s) => String(s || "").trim()).filter(Boolean))];
  if (!unique.length) return { error: "No pieces selected." };

  const username = session.username || "";

  const [bundled, blocked, cart, buyer] = await Promise.all([
    listActiveBundledSkus(),
    findSkusHeldByOthers(unique, username),
    getBuyerCart(session.id),
    getBuyerById(session.id),
  ]);

  const inBundle = unique.filter((s) => bundled.has(s.toUpperCase()));
  if (inBundle.length) {
    return {
      error: `In an active suggested lot (not sold individually): ${inBundle
        .slice(0, 6)
        .join(", ")}${inBundle.length > 6 ? "…" : ""}`,
    };
  }

  if (blocked.length) {
    return {
      error: `On hold for another buyer: ${blocked.slice(0, 6).join(", ")}${
        blocked.length > 6 ? "…" : ""
      }`,
    };
  }

  if (!buyer) return { error: "Buyer account not found." };

  const existing = new Set(cart.map((i) => String(i.sku || "").toUpperCase()));
  const toResolve = unique.filter((sku) => !existing.has(sku.toUpperCase()));
  const skippedAlready = unique.length - toResolve.length;

  const products = toResolve.length
    ? await getCatalogProductsBySkus(toResolve, { buyerUsername: username })
    : new Map();

  const added: string[] = [];
  let skipped = skippedAlready;
  const next: CartItem[] = [...cart];
  const nowIso = new Date().toISOString();

  for (const sku of toResolve) {
    const product = products.get(sku) || products.get(sku.toUpperCase());
    if (!product || product.soldOut || product.held || product.price == null) {
      skipped += 1;
      continue;
    }
    const skuKey = String(product.sku || sku).toUpperCase();
    if (existing.has(skuKey)) {
      skipped += 1;
      continue;
    }
    next.push({
      sku: product.sku,
      title: product.title,
      brand: product.brand,
      price: Math.round(product.price),
      imageUrl: product.imageUrl,
      addedAt: nowIso,
    });
    existing.add(skuKey);
    added.push(product.sku);
  }

  if (!added.length) {
    return {
      error: skipped
        ? "None of the selected pieces could be added (held, sold, or already in order)."
        : "Nothing to add.",
      added: 0,
      skipped,
    };
  }

  const limitErr = cartLimitError(next, buyer);
  if (limitErr) return { error: limitErr };

  // Persist cart, then hold only newly added SKUs (avoid full release+resync on every add).
  await setBuyerCart(session.id, next);
  if (username) {
    await upsertPortalHolds({
      skus: added,
      portalUsername: username,
      buyerDisplayName: session.name || username,
      reason: "cart",
      quoteId: null,
    });
  }

  const cartTotal = next.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

  revalidatePath("/wholesale");
  revalidatePath("/wholesale/cart");
  revalidatePath("/wholesale", "layout");

  return {
    ok: true,
    added: added.length,
    skipped,
    cartCount: next.length,
    cartTotal,
  };
}
