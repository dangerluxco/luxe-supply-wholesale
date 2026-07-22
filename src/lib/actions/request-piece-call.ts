"use server";

import { getSessionForArea } from "@/lib/auth";
import { getBuyerById, getBuyerCart } from "@/lib/firestore/buyers";
import { addCallRequest } from "@/lib/firestore/callRequests";
import { getCatalogProductsBySkus } from "@/lib/firestore/catalog";
import { notifyStaffOfCallRequest } from "@/lib/notify";

/**
 * Buyer "request a call / viewing". Thin action module (client-facing
 * entrypoint) — creates a pending call request and notifies staff by email
 * (non-blocking; works without Resend, the request still lands on the rep
 * dashboard).
 *
 * Two modes:
 * - piece: `{ sku, title }` — a single product page request
 * - cart:  `{ cart: true }` — about everything currently in the buyer's cart
 *   (items are read server-side; suggested-lot lines expand as one entry each)
 */
export async function requestPieceCall(opts: {
  sku?: string;
  title?: string;
  cart?: boolean;
  preferredTimes?: string;
  note?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const session = await getSessionForArea("buyer");
  if (!session || session.role !== "BUYER" || session.source !== "firestore") {
    return { error: "Sign in required." };
  }

  const buyer = await getBuyerById(session.id);
  if (!buyer) return { error: "Buyer account not found." };

  let sku: string;
  let title: string;
  let imageUrl: string | null = null;
  let items: Array<{ sku: string; title: string; imageUrl: string | null }> = [];

  if (opts.cart) {
    const cart = await getBuyerCart(session.id);
    if (!cart.length) return { error: "Your order is empty." };
    items = cart.map((i) => ({ sku: i.sku, title: i.title, imageUrl: i.imageUrl }));
    sku = items[0]!.sku;
    imageUrl = items[0]!.imageUrl;
    title =
      items.length === 1
        ? items[0]!.title
        : `${items.length} pieces from their order`;
  } else {
    sku = String(opts.sku || "").trim();
    if (!sku) return { error: "Missing piece." };
    title = opts.title || sku;
    // Snapshot the hero image so the staff pipeline card shows the piece.
    const products = await getCatalogProductsBySkus([sku]).catch(
      () => new Map<string, never>(),
    );
    imageUrl = products.get(sku)?.imageUrl || null;
  }

  const requestId = await addCallRequest({
    username: buyer.username,
    displayName: buyer.displayName || buyer.username,
    email: buyer.email,
    sku,
    title,
    imageUrl,
    items,
    preferredTimes: opts.preferredTimes,
    note: opts.note,
  });

  try {
    await notifyStaffOfCallRequest({
      requestId,
      buyerName: buyer.displayName || buyer.username,
      buyerEmail: buyer.email,
      sku,
      title,
      items: items.map((i) => `${i.title} (${i.sku})`),
      preferredTimes: opts.preferredTimes,
      note: opts.note,
    });
  } catch (err) {
    console.warn("[requestPieceCall] staff notify failed:", err instanceof Error ? err.message : err);
  }

  return { ok: true };
}
