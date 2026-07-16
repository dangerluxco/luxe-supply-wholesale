"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getSuggestedLotById } from "@/lib/firestore/suggestedLots";
import {
  cartHoldSkus,
  cartLimitError,
  getBuyerById,
  getBuyerCart,
  setBuyerCart,
  type CartItem,
} from "@/lib/firestore/buyers";
import { findSkusHeldByOthers, syncCartHolds } from "@/lib/firestore/holds";

/**
 * Thin entry for BundleStrip (buyer). Kept off bundles-firestore.ts so the
 * buyer storefront soft-nav graph does not share that module with BundleBuilder.
 */
export async function addSuggestedLotToCart(lotId: string) {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER || session.source !== "firestore") {
    return { error: "Sign in required." };
  }

  const lot = await getSuggestedLotById(lotId);
  if (!lot || lot.status !== "active") return { error: "Lot not found." };
  if (lot.lotPrice == null) return { error: "Lot price unavailable." };

  const username = (session.username || "").toLowerCase();
  if (lot.buyerUsername && !lot.publishedToAll && lot.buyerUsername !== username) {
    return { error: "This lot is for another client." };
  }

  const cart = await getBuyerCart(session.id);
  const lotSku = `lot:${lot.id}`;
  if (cart.some((i) => i.isSuggestedLot && (i.lotId === lot.id || i.sku === lotSku))) {
    return { error: "Already in your order." };
  }

  const lotSkus = lot.items.map((it) => it.sku).filter(Boolean);
  const blocked = await findSkusHeldByOthers(lotSkus, username);
  if (blocked.length) {
    return {
      error: `On hold for another buyer: ${blocked.slice(0, 6).join(", ")}${
        blocked.length > 6 ? "…" : ""
      }`,
    };
  }

  const lotItems = lot.items.map((it) => ({
    sku: it.sku,
    title: it.title || it.sku,
    brand: it.brand || "",
    quantity: it.quantity || 1,
    imageUrl: it.imageUrl,
  }));
  const uniqueLotItems = (() => {
    const seen = new Set<string>();
    return lotItems.filter((it) => {
      const key = String(it.sku || "").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  const firstImage = uniqueLotItems.find((it) => it.imageUrl)?.imageUrl || null;

  const next: CartItem[] = [
    ...cart,
    {
      sku: lotSku,
      title: lot.title || "Suggested lot",
      brand: "",
      price: lot.lotPrice,
      imageUrl: firstImage,
      addedAt: new Date().toISOString(),
      isSuggestedLot: true,
      lotId: lot.id,
      lotItems: uniqueLotItems,
    },
  ];

  const buyer = await getBuyerById(session.id);
  if (!buyer) return { error: "Buyer account not found." };
  const limitErr = cartLimitError(next, buyer);
  if (limitErr) return { error: limitErr };

  await setBuyerCart(session.id, next);
  await syncCartHolds({
    username: session.username || "",
    displayName: session.name,
    skus: cartHoldSkus(next),
  });

  revalidatePath("/wholesale");
  revalidatePath("/wholesale/cart");
  return { ok: true };
}
