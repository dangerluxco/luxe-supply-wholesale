"use server";

import { getSessionForArea } from "@/lib/auth";
import { getBuyerById } from "@/lib/firestore/buyers";
import { addCallRequest } from "@/lib/firestore/callRequests";
import { getCatalogProductsBySkus } from "@/lib/firestore/catalog";
import { notifyStaffOfCallRequest } from "@/lib/notify";

/**
 * Buyer "request a call / viewing" about a specific piece. Thin action module
 * (client-facing entrypoint) — creates a pending call request and notifies staff
 * by email (non-blocking; works without Resend, the request still lands on the
 * rep dashboard).
 */
export async function requestPieceCall(opts: {
  sku: string;
  title?: string;
  preferredTimes?: string;
  note?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const session = await getSessionForArea("buyer");
  if (!session || session.role !== "BUYER" || session.source !== "firestore") {
    return { error: "Sign in required." };
  }
  const sku = String(opts.sku || "").trim();
  if (!sku) return { error: "Missing piece." };

  const buyer = await getBuyerById(session.id);
  if (!buyer) return { error: "Buyer account not found." };

  // Snapshot the hero image so the staff pipeline card shows the piece.
  const products = await getCatalogProductsBySkus([sku]).catch(
    () => new Map<string, never>(),
  );
  const product = products.get(sku);

  const requestId = await addCallRequest({
    username: buyer.username,
    displayName: buyer.displayName || buyer.username,
    email: buyer.email,
    sku,
    title: opts.title,
    imageUrl: product?.imageUrl || null,
    preferredTimes: opts.preferredTimes,
    note: opts.note,
  });

  try {
    await notifyStaffOfCallRequest({
      requestId,
      buyerName: buyer.displayName || buyer.username,
      buyerEmail: buyer.email,
      sku,
      title: opts.title || sku,
      preferredTimes: opts.preferredTimes,
      note: opts.note,
    });
  } catch (err) {
    console.warn("[requestPieceCall] staff notify failed:", err instanceof Error ? err.message : err);
  }

  return { ok: true };
}
