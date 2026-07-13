"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { getCatalogProductBySku } from "@/lib/firestore/catalog";
import { addHoldAlert, removeHoldAlert } from "@/lib/firestore/holdAlerts";

export async function addHoldAlertAction(sku: string) {
  const session = await getSession();
  if (!session || session.role !== "BUYER" || session.source !== "firestore" || !session.username) {
    return { error: "Sign in required." };
  }
  const clean = String(sku || "").trim();
  if (!clean) return { error: "Missing SKU." };

  const product = await getCatalogProductBySku(clean, { buyerUsername: session.username });
  if (!product) return { error: "Item not found." };

  await addHoldAlert({
    username: session.username,
    displayName: session.name,
    email: session.email,
    sku: product.sku,
    title: product.title,
    brand: product.brand,
  });

  revalidatePath(`/wholesale/product/${product.sku}`);
  revalidatePath("/wholesale/wishlist");
  return { ok: true };
}

export async function removeHoldAlertAction(sku: string) {
  const session = await getSession();
  if (!session || session.role !== "BUYER" || !session.username) {
    return { error: "Sign in required." };
  }
  const clean = String(sku || "").trim();
  if (!clean) return { error: "Missing SKU." };

  await removeHoldAlert(session.username, clean);

  revalidatePath(`/wholesale/product/${clean}`);
  revalidatePath("/wholesale/wishlist");
  return { ok: true };
}
