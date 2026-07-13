"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import {
  archiveSuggestedLot,
  getSuggestedLotById,
  saveSuggestedLot,
} from "@/lib/firestore/suggestedLots";
import { getCatalogProductBySku } from "@/lib/firestore/catalog";
import {
  cartHoldSkus,
  getBuyerCart,
  setBuyerCart,
  syncCartHolds,
  type CartItem,
} from "@/lib/firestore/buyers";

async function requireStaff() {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function saveSuggestedLotAction(formData: FormData) {
  const session = await requireStaff();

  const get = (key: string) => {
    const v = formData.get(key);
    return v == null ? "" : String(v);
  };

  const buyerUsername = get("buyerUsername").trim();
  const buyerDisplayName = get("buyerDisplayName").trim();
  const title = get("name").trim() || "Suggested lot";
  const note = get("note").trim();
  const lotPrice = Number(get("lotPrice") || 0);
  const skus = formData.getAll("skus").map(String).filter(Boolean);
  const titles = formData.getAll("titles").map(String);
  const brands = formData.getAll("brands").map(String);
  const formImageUrls = formData.getAll("imageUrls").map(String);

  if (!buyerUsername || !skus.length || !(lotPrice >= 0)) {
    redirect(
      "/wholesaleportal/rep/bundles?error=" +
        encodeURIComponent("Client, pieces, and lot price are required."),
    );
  }

  const items = await Promise.all(
    skus.map(async (sku, i) => {
      const product = await getCatalogProductBySku(sku).catch(() => null);
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
    buyerUsername,
    buyerDisplayName: buyerDisplayName || buyerUsername,
    title,
    note,
    lotPrice,
    items,
    staffEmail: session.email,
  });

  revalidatePath("/wholesaleportal/rep/bundles");
  revalidatePath("/wholesale");
  redirect("/wholesaleportal/rep/bundles");
}

export async function archiveSuggestedLotAction(lotId: string) {
  const session = await requireStaff();
  await archiveSuggestedLot(lotId, session.email);
  revalidatePath("/wholesaleportal/rep/bundles");
  revalidatePath("/wholesale");
}

export async function addSuggestedLotToCart(lotId: string) {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER || session.source !== "firestore") {
    return { error: "Sign in required." };
  }

  const lot = await getSuggestedLotById(lotId);
  if (!lot || lot.status !== "active") return { error: "Lot not found." };
  if (lot.lotPrice == null) return { error: "Lot price unavailable." };

  const username = (session.username || "").toLowerCase();
  if (lot.buyerUsername && lot.buyerUsername !== username) {
    return { error: "This lot is for another client." };
  }

  const cart = await getBuyerCart(session.id);
  const lotSku = `lot:${lot.id}`;
  if (cart.some((i) => i.isSuggestedLot && (i.lotId === lot.id || i.sku === lotSku))) {
    return { error: "Already in your order." };
  }

  const lotItems = lot.items.map((it) => ({
    sku: it.sku,
    title: it.title || it.sku,
    brand: it.brand || "",
    quantity: it.quantity || 1,
    imageUrl: it.imageUrl,
  }));
  const firstImage = lotItems.find((it) => it.imageUrl)?.imageUrl || null;

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
      lotItems,
    },
  ];

  await setBuyerCart(session.id, next);
  await syncCartHolds({
    buyerId: session.id,
    username: session.username || "",
    displayName: session.name,
    skus: cartHoldSkus(next),
  });

  revalidatePath("/wholesale");
  revalidatePath("/wholesale/cart");
  return { ok: true };
}
