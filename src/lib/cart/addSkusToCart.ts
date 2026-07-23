import { revalidatePath } from "next/cache";
import { getCatalogProductsBySkus } from "@/lib/firestore/catalog";
import {
  cartItemsLimitMessage,
  cartValueLimitMessage,
  getBuyerById,
  getBuyerCart,
  setBuyerCart,
  type CartItem,
} from "@/lib/firestore/buyers";
import { loadActiveHoldsBySku, upsertPortalHolds } from "@/lib/firestore/holds";
import { listActiveBundledSkus } from "@/lib/firestore/suggestedLots";
import type { SessionUser } from "@/lib/auth";

export type AddSkusToCartResult =
  | {
      ok: true;
      added: number;
      skipped: number;
      cartCount: number;
      cartTotal: number;
      /** Set when some pieces were left out because an order limit was reached. */
      limitNote?: string;
    }
  | { error: string; added?: number; skipped?: number };

/** Core add-to-cart logic shared by the buyer API route (and thin server actions). */
export async function addSkusToCartForBuyer(
  session: SessionUser,
  skus: string[],
): Promise<AddSkusToCartResult> {
  const unique = [...new Set(skus.map((s) => String(s || "").trim()).filter(Boolean))];
  if (!unique.length) return { error: "No pieces selected." };

  const username = session.username || "";
  const me = username.trim().toLowerCase();

  const [bundled, holds, cart, buyer] = await Promise.all([
    listActiveBundledSkus(),
    loadActiveHoldsBySku(unique),
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

  const holdByUpper = new Map([...holds.values()].map((h) => [h.sku.toUpperCase(), h]));
  const blocked: string[] = [];
  const pendingRequest: string[] = [];
  for (const sku of unique) {
    const hold = holdByUpper.get(sku.toUpperCase());
    if (!hold) continue;
    if (!me || hold.portalUsername !== me) blocked.push(sku);
    // Own hold tied to a submitted invoice request: re-adding would detach the
    // hold from the pending quote and let the one-of-one piece be ordered twice.
    else if (hold.reason === "quote") pendingRequest.push(sku);
  }

  if (blocked.length) {
    return {
      error: `On hold for another buyer: ${blocked.slice(0, 6).join(", ")}${
        blocked.length > 6 ? "…" : ""
      }`,
    };
  }

  if (pendingRequest.length) {
    return {
      error: `Already on your pending invoice request: ${pendingRequest
        .slice(0, 6)
        .join(", ")}${pendingRequest.length > 6 ? "…" : ""}`,
    };
  }

  if (!buyer) return { error: "Buyer account not found." };

  const existing = new Set(cart.map((i) => String(i.sku || "").toUpperCase()));
  const toResolve = unique.filter((sku) => !existing.has(sku.toUpperCase()));
  const skippedAlready = unique.length - toResolve.length;

  if (!toResolve.length) {
    return { error: "Already in your order.", added: 0, skipped: skippedAlready };
  }

  const products = toResolve.length
    ? await getCatalogProductsBySkus(toResolve, { buyerUsername: username })
    : new Map();

  const added: string[] = [];
  let skipped = skippedAlready;
  let limitSkipped = 0;
  const next: CartItem[] = [...cart];
  let cartTotal = cart.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
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
    const price = Math.round(product.price);
    // Hold caps take a partial batch: keep adding pieces (in requested order)
    // until a cap would be exceeded, rather than rejecting the whole selection.
    if (next.length + 1 > buyer.maxCartItems || cartTotal + price > buyer.maxCartValue) {
      skipped += 1;
      limitSkipped += 1;
      continue;
    }
    next.push({
      sku: product.sku,
      title: product.title,
      brand: product.brand,
      price,
      imageUrl: product.imageUrl,
      addedAt: nowIso,
    });
    cartTotal += price;
    existing.add(skuKey);
    added.push(product.sku);
  }

  if (!added.length) {
    if (limitSkipped) {
      return {
        error:
          next.length >= buyer.maxCartItems
            ? cartItemsLimitMessage(buyer.maxCartItems)
            : cartValueLimitMessage(buyer.maxCartValue),
        added: 0,
        skipped,
      };
    }
    return {
      error: skipped
        ? "None of the selected pieces could be added (held, sold, or already in order)."
        : "Nothing to add.",
      added: 0,
      skipped,
    };
  }

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

  revalidatePath("/wholesale");
  revalidatePath("/wholesale/cart");
  revalidatePath("/wholesale", "layout");

  return {
    ok: true,
    added: added.length,
    skipped,
    cartCount: next.length,
    cartTotal,
    ...(limitSkipped
      ? {
          limitNote:
            next.length >= buyer.maxCartItems
              ? `${buyer.maxCartItems}-item order limit reached`
              : `$${buyer.maxCartValue.toLocaleString("en-US")} order limit reached`,
        }
      : {}),
  };
}
