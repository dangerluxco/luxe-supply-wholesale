"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { archiveSuggestedLot } from "@/lib/firestore/suggestedLots";

function revalidateCatalogSurfaces() {
  // Buyer storefront (page + layout search index) and staff catalog/builder lists.
  revalidatePath("/wholesale");
  revalidatePath("/wholesale", "layout");
  revalidatePath("/wholesaleportal/rep/bundles");
  revalidatePath("/wholesaleportal/rep/catalog");
}

/**
 * Thin server-action entry for archive — kept separate so the Archive button’s
 * client import graph stays small and doesn’t drag unrelated action modules.
 */
export async function archiveSuggestedLotAction(lotId: string) {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    throw new Error("Unauthorized");
  }
  await archiveSuggestedLot(lotId, session.email);
  revalidateCatalogSurfaces();
}
