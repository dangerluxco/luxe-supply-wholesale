"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import {
  getSuggestedLotById,
  saveSuggestedLot,
} from "@/lib/firestore/suggestedLots";
import { getCatalogProductBySku } from "@/lib/firestore/catalog";

async function requireStaff() {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    throw new Error("Unauthorized");
  }
  return session;
}

/** Staff-only: create/update suggested lots. Buyer add-to-cart lives in add-lot-to-cart.ts. */
export async function saveSuggestedLotAction(formData: FormData) {
  const session = await requireStaff();

  const get = (key: string) => {
    const v = formData.get(key);
    return v == null ? "" : String(v);
  };

  const lotId = get("lotId").trim();
  const buyerUsername = get("buyerUsername").trim();
  const buyerDisplayName = get("buyerDisplayName").trim();
  const title = get("name").trim() || "Suggested lot";
  const note = get("note").trim();
  const lotPrice = Number(get("lotPrice") || 0);
  const rawSkus = formData.getAll("skus").map(String);
  const titles = formData.getAll("titles").map(String);
  const brands = formData.getAll("brands").map(String);
  const formImageUrls = formData.getAll("imageUrls").map(String);

  const bundlesPath = "/wholesaleportal/rep/bundles";
  const errorPath = lotId ? `${bundlesPath}/${lotId}/edit` : bundlesPath;

  // Unique-by-SKU (case-insensitive) so a lot never stores the same piece twice.
  const seenSkus = new Set<string>();
  const uniqueEntries: { sku: string; index: number }[] = [];
  rawSkus.forEach((skuRaw, index) => {
    const sku = String(skuRaw || "").trim();
    if (!sku) return;
    const key = sku.toLowerCase();
    if (seenSkus.has(key)) return;
    seenSkus.add(key);
    uniqueEntries.push({ sku, index });
  });

  if (!buyerUsername || !uniqueEntries.length || !(lotPrice >= 0)) {
    redirect(
      `${errorPath}?error=` +
        encodeURIComponent("Client, pieces, and lot price are required."),
    );
  }

  if (lotId) {
    const existing = await getSuggestedLotById(lotId);
    if (!existing || existing.status !== "active") {
      redirect(
        `${bundlesPath}?error=` + encodeURIComponent("That suggested lot is not available to edit."),
      );
    }
  }

  const items = await Promise.all(
    uniqueEntries.map(async ({ sku, index: i }) => {
      const product = await getCatalogProductBySku(sku, { includeBundled: true }).catch(
        () => null,
      );
      const resolvedUrls =
        product?.imageUrls?.length
          ? product.imageUrls
          : product?.imageUrl
            ? [product.imageUrl]
            : formImageUrls[i]
              ? [formImageUrls[i]!]
              : [];
      return {
        sku,
        title: titles[i] || product?.title || sku,
        brand: brands[i] || product?.brand || "",
        imageUrl: resolvedUrls[0] || null,
        imageUrls: resolvedUrls,
        quantity: 1,
      };
    }),
  );

  await saveSuggestedLot({
    lotId: lotId || undefined,
    buyerUsername,
    buyerDisplayName: buyerDisplayName || buyerUsername,
    title,
    note,
    lotPrice,
    items,
    staffEmail: session.email,
  });

  revalidatePath(bundlesPath);
  if (lotId) revalidatePath(`${bundlesPath}/${lotId}/edit`);
  revalidatePath("/wholesale");
  redirect(bundlesPath);
}
