"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { QUOTE_STATUSES } from "@/lib/constants";
import { updateQuoteStatus } from "@/lib/firestore/quotes";
import { saveCatalogSelection } from "@/lib/firestore/catalog";

export async function setQuoteStatus(quoteId: string, status: string) {
  const session = await getSession();
  if (!session || session.source !== "firestore") {
    return { error: "Staff session required." };
  }
  const next = String(status || "").toLowerCase();
  if (!(QUOTE_STATUSES as readonly string[]).includes(next)) {
    return { error: "Invalid status." };
  }
  await updateQuoteStatus(quoteId, { status: next }, session.email);
  revalidatePath("/wholesaleportal/rep");
  return { ok: true };
}

export async function saveCatalogSettings(_prev: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || (session.role !== "REP" && session.role !== "MANAGER")) {
    return { error: "Staff session required." };
  }
  if (session.source !== "firestore") {
    return { error: "Catalog settings require a live Firestore staff session." };
  }

  const mode = String(formData.get("mode") || "all") === "sku_list" ? "sku_list" : "all";
  const raw = String(formData.get("skus") || "");
  const skus = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  await saveCatalogSelection({ mode, skus });
  revalidatePath("/wholesaleportal/rep/catalog");
  return { ok: true, message: "Catalog settings saved." };
}
