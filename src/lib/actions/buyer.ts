"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  HOLD_HOURS,
  INSURED_SHIPPING,
  INVOICE_STATUS,
  MIN_ORDER_VALUE,
  ORDER_STATUS,
  PRODUCT_STATUS,
  CALL_STATUS,
} from "@/lib/constants";

async function nextNumber(prefix: string, field: "order" | "invoice"): Promise<string> {
  const model = field === "order" ? prisma.order : prisma.invoice;
  // @ts-expect-error dynamic model access
  const last = await model.findFirst({ orderBy: { number: "desc" }, where: { number: { startsWith: prefix } } });
  const n = last ? parseInt(last.number.split("-")[1], 10) + 1 : 2000;
  return `${prefix}-${n}`;
}

// Find or create the buyer's active CART order.
async function getOrCreateCart(accountId: string, buyerId: string) {
  let cart = await prisma.order.findFirst({
    where: { accountId, status: ORDER_STATUS.CART },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
  if (!cart) {
    const number = await nextNumber("ORD", "order");
    cart = await prisma.order.create({
      data: { number, accountId, buyerId, status: ORDER_STATUS.CART },
      include: { items: true },
    });
  }
  return cart;
}

export async function addToCart(productId: string) {
  const session = await getSession();
  if (!session?.accountId) return { error: "Not signed in." };

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { error: "Piece not found." };

  // One-of-one integrity: only AVAILABLE pieces can be held.
  if (product.status !== PRODUCT_STATUS.AVAILABLE) {
    return { error: "This piece is no longer available — it's one of one." };
  }

  const cart = await getOrCreateCart(session.accountId, session.id);
  const holdExpiresAt = new Date(Date.now() + HOLD_HOURS * 3600 * 1000);

  await prisma.$transaction([
    prisma.orderItem.create({
      data: { orderId: cart.id, productId: product.id, priceAtAdd: product.wholesalePrice, holdExpiresAt },
    }),
    prisma.product.update({
      where: { id: product.id },
      data: { status: PRODUCT_STATUS.ON_HOLD, holdExpiresAt },
    }),
  ]);

  revalidatePath("/portal");
  revalidatePath("/portal/cart");
  return { ok: true };
}

export async function removeFromCart(itemId: string) {
  const session = await getSession();
  if (!session?.accountId) return;

  const item = await prisma.orderItem.findUnique({ where: { id: itemId }, include: { order: true } });
  if (!item || item.order.accountId !== session.accountId || item.order.status !== ORDER_STATUS.CART) return;

  await prisma.$transaction([
    prisma.orderItem.delete({ where: { id: itemId } }),
    prisma.product.update({
      where: { id: item.productId },
      data: { status: PRODUCT_STATUS.AVAILABLE, holdExpiresAt: null },
    }),
  ]);

  revalidatePath("/portal/cart");
  revalidatePath("/portal");
}

// Checkout: enforce minimum, generate an invoice (Net 30, no card) + fulfillment task.
export async function checkout(formData: FormData) {
  const session = await getSession();
  if (!session?.accountId) return;

  const poNumber = String(formData.get("poNumber") ?? "").trim() || null;

  const cart = await prisma.order.findFirst({
    where: { accountId: session.accountId, status: ORDER_STATUS.CART },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!cart || cart.items.length === 0) return;

  const subtotal = cart.items.reduce((a, b) => a + b.priceAtAdd, 0);
  if (subtotal < MIN_ORDER_VALUE) return; // guarded in UI too

  const total = subtotal + INSURED_SHIPPING;
  const invNumber = await nextNumber("INV", "invoice");
  const dueDate = new Date(Date.now() + 30 * 86400 * 1000);

  await prisma.$transaction([
    prisma.order.update({
      where: { id: cart.id },
      data: {
        status: ORDER_STATUS.TO_PICK,
        poNumber,
        shipBy: new Date(Date.now() + 2 * 86400 * 1000),
      },
    }),
    // Sell the pieces permanently.
    prisma.product.updateMany({
      where: { id: { in: cart.items.map((i) => i.productId) } },
      data: { status: PRODUCT_STATUS.SOLD, soldToId: session.accountId, soldAt: new Date() },
    }),
    prisma.invoice.create({
      data: {
        number: invNumber,
        accountId: session.accountId,
        orderId: cart.id,
        status: INVOICE_STATUS.SENT,
        poNumber,
        subtotal,
        shipping: INSURED_SHIPPING,
        total,
        dueDate,
        lineItems: JSON.stringify(
          cart.items.map((i) => ({ name: i.product.name, sku: i.product.sku, price: i.priceAtAdd })),
        ),
      },
    }),
    prisma.fulfillmentTask.create({
      data: {
        orderId: cart.id,
        status: "TO_PICK",
        packingChecklist: JSON.stringify([
          { label: "Condition photographed before wrap", done: false },
          { label: "Acid-free tissue + custom crate", done: false },
          { label: "Certificate of provenance enclosed", done: false },
          { label: `Insurance seal · $${total.toLocaleString()} declared`, done: false },
        ]),
      },
    }),
  ]);

  console.log(`[invoice] Generated ${invNumber} for ${session.name} — $${total} (Net 30). No email sent (MVP).`);
  revalidatePath("/portal");
  redirect(`/portal/invoices/${invNumber}`);
}

// Void wrapper so addToCart can be used directly as a <form action>.
export async function addToCartForm(productId: string): Promise<void> {
  await addToCart(productId);
}

// Add every piece in a live bundle to the cart, each held 48h.
export async function addBundleToCart(bundleId: string): Promise<void> {
  const session = await getSession();
  if (!session?.accountId) return;

  const bundle = await prisma.bundle.findUnique({
    where: { id: bundleId },
    include: { products: true },
  });
  if (!bundle || bundle.status !== "LIVE") return;

  const cart = await getOrCreateCart(session.accountId, session.id);
  const holdExpiresAt = new Date(Date.now() + HOLD_HOURS * 3600 * 1000);

  // Bundled pieces are locked to the bundle; adding the bundle holds them for this buyer.
  const ops = bundle.products.flatMap((p) => [
    prisma.orderItem.create({
      data: { orderId: cart.id, productId: p.id, priceAtAdd: p.wholesalePrice, holdExpiresAt },
    }),
    prisma.product.update({
      where: { id: p.id },
      data: { status: PRODUCT_STATUS.ON_HOLD, holdExpiresAt },
    }),
  ]);
  await prisma.$transaction(ops);

  revalidatePath("/portal");
  revalidatePath("/portal/cart");
  redirect("/portal/cart");
}

export async function requestVideoCall(formData: FormData) {
  const session = await getSession();
  if (!session?.accountId) return { error: "Not signed in." };

  const productId = String(formData.get("productId") ?? "");
  const slot = String(formData.get("slot") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!productId || !slot) return { error: "Pick a day and time." };

  const account = await prisma.account.findUnique({ where: { id: session.accountId } });
  const repId = account?.assignedRepId;
  if (!repId) return { error: "No rep assigned to your account." };

  await prisma.videoCallRequest.create({
    data: { productId, buyerId: session.id, repId, requestedSlot: slot, note, status: CALL_STATUS.PENDING },
  });

  console.log(`[video-call] ${session.name} requested a viewing (${slot}). No email sent (MVP).`);
  revalidatePath("/portal");
  return { ok: true };
}
