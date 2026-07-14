"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  resolveCuratedDraftItems,
  saveCuratedCatalog,
  setCatalogMode,
  type CuratedCatalogItem,
} from "@/lib/firestore/catalog";

function assertStaffSession(session: Awaited<ReturnType<typeof getSession>>) {
  return (
    !!session &&
    (session.role === "REP" || session.role === "MANAGER") &&
    session.source === "firestore"
  );
}

/** Thin entries for CatalogSettingsForm — isolated from portal.ts soft-nav stubs. */

export async function setCatalogModeAction(mode: string) {
  const session = await getSession();
  if (!assertStaffSession(session)) return { error: "Staff session required." };

  const next = mode === "sku_list" ? "sku_list" : "all";
  await setCatalogMode(next);
  revalidatePath("/wholesaleportal/rep/catalog");
  revalidatePath("/wholesale");
  return {
    ok: true,
    message:
      next === "all"
        ? "Storefront is now showing all products (testing)."
        : "Storefront is now showing the curated catalog.",
  };
}

export async function buildCuratedCatalogDraft(
  skusText: string,
): Promise<
  | { error: string }
  | { ok: true; items: CuratedCatalogItem[]; unresolvedSkus: string[] }
> {
  const session = await getSession();
  if (!assertStaffSession(session)) return { error: "Staff session required." };

  const skus = String(skusText || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!skus.length) return { error: "Paste at least one SKU." };
  if (skus.length > 1000) return { error: "Paste 1000 SKUs or fewer at a time." };

  try {
    const { items, unresolvedSkus } = await resolveCuratedDraftItems(skus);
    return { ok: true, items, unresolvedSkus };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not resolve SKUs." };
  }
}

export async function saveCuratedCatalogAction(
  items: CuratedCatalogItem[],
  unresolvedSkus: string[],
) {
  const session = await getSession();
  if (!assertStaffSession(session)) return { error: "Staff session required." };
  if (!Array.isArray(items) || !items.length) {
    return { error: "Add at least one item before saving." };
  }

  try {
    await saveCuratedCatalog({ items, unresolvedSkus, updatedBy: session!.email });
    revalidatePath("/wholesaleportal/rep/catalog");
    revalidatePath("/wholesale");
    return {
      ok: true,
      message: `Curated catalog saved — ${items.length} item${items.length === 1 ? "" : "s"} now live.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save curated catalog." };
  }
}
