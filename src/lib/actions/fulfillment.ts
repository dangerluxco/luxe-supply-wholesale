"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ORDER_STATUS, ROLE } from "@/lib/constants";

async function requireFulfillment() {
  const session = await getSession();
  if (!session || session.role !== ROLE.FULFILLMENT) throw new Error("Unauthorized");
  return session;
}

// Confirm a pick against its reference photo (MVP: button + timestamp; camera stubbed).
export async function verifyPick(orderItemId: string) {
  await requireFulfillment();
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: true },
  });
  if (!item) return;

  await prisma.orderItem.update({
    where: { id: orderItemId },
    data: { pickVerifiedAt: new Date() },
  });

  // First verified pick moves the order into PICKING.
  if (item.order.status === ORDER_STATUS.TO_PICK) {
    await prisma.order.update({ where: { id: item.orderId }, data: { status: ORDER_STATUS.PICKING } });
    await prisma.fulfillmentTask.update({
      where: { orderId: item.orderId },
      data: { status: ORDER_STATUS.PICKING },
    });
  }
  console.log(`[fulfillment] Pick verified for item ${orderItemId} (photo match).`);
  revalidatePath("/fulfillment");
}

// Advance to packing once every item is verified.
export async function moveToPacking(orderId: string) {
  await requireFulfillment();
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  if (items.length === 0 || items.some((i) => !i.pickVerifiedAt)) return;

  await prisma.order.update({ where: { id: orderId }, data: { status: ORDER_STATUS.PACKING } });
  await prisma.fulfillmentTask.update({
    where: { orderId },
    data: { status: ORDER_STATUS.PACKING },
  });
  revalidatePath("/fulfillment");
}

export async function toggleChecklistItem(taskId: string, index: number) {
  await requireFulfillment();
  const task = await prisma.fulfillmentTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const checklist: { label: string; done: boolean }[] = JSON.parse(task.packingChecklist);
  if (!checklist[index]) return;
  checklist[index].done = !checklist[index].done;
  await prisma.fulfillmentTask.update({
    where: { id: taskId },
    data: { packingChecklist: JSON.stringify(checklist) },
  });
  revalidatePath("/fulfillment");
}

export async function setCarrier(taskId: string, carrier: string) {
  await requireFulfillment();
  await prisma.fulfillmentTask.update({ where: { id: taskId }, data: { carrier } });
  revalidatePath("/fulfillment");
}

export async function setTracking(formData: FormData) {
  await requireFulfillment();
  const taskId = String(formData.get("taskId") ?? "");
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim() || null;
  await prisma.fulfillmentTask.update({ where: { id: taskId }, data: { trackingNumber } });
  revalidatePath("/fulfillment");
}

// Ship only once the checklist is complete and tracking is entered.
export async function markShipped(taskId: string) {
  await requireFulfillment();
  const task = await prisma.fulfillmentTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const checklist: { done: boolean }[] = JSON.parse(task.packingChecklist);
  const complete = checklist.every((c) => c.done);
  if (!complete || !task.carrier || !task.trackingNumber) return;

  await prisma.$transaction([
    prisma.fulfillmentTask.update({
      where: { id: taskId },
      data: { status: ORDER_STATUS.SHIPPED, shippedAt: new Date() },
    }),
    prisma.order.update({ where: { id: task.orderId }, data: { status: ORDER_STATUS.SHIPPED } }),
  ]);
  console.log(`[fulfillment] Order shipped via ${task.carrier} (${task.trackingNumber}).`);
  revalidatePath("/fulfillment");
}
