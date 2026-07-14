"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { updateBuyerCartLimits } from "@/lib/firestore/buyers";

/**
 * Thin server-action entry for per-client cart limits.
 * Kept separate from portal.ts so ClientCartLimitsForm’s client import graph
 * does not share the mega portal action module with InviteBuyerForm / catalog
 * (soft-nav between /clients and /clients/[id] was hitting undefined webpack
 * factories for the shared portal.ts client stub).
 */
export async function saveBuyerCartLimits(
  _prev: { error?: string; message?: string; ok?: boolean } | undefined,
  formData: FormData,
) {
  const session = await getSession();
  if (
    !session ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER) ||
    session.source !== "firestore"
  ) {
    return { error: "Staff session required." };
  }

  const buyerId = String(formData.get("buyerId") || "").trim();
  if (!buyerId) return { error: "Missing buyer id." };

  try {
    const buyer = await updateBuyerCartLimits(buyerId, {
      maxCartItems: Number(formData.get("maxCartItems") || 0),
      maxCartValue: Number(formData.get("maxCartValue") || 0),
    });
    revalidatePath(`/wholesaleportal/rep/clients/${buyerId}`);
    revalidatePath("/wholesaleportal/rep/clients");
    return {
      ok: true,
      message: `Limits updated: ${buyer.maxCartItems} items / $${buyer.maxCartValue.toLocaleString("en-US")}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update limits." };
  }
}
