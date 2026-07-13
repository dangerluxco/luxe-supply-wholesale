"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  BUNDLE_STATUS,
  CALL_STATUS,
  DISCOUNT_TYPE,
  LEAD_STATUS,
  PRODUCT_STATUS,
  ROLE,
  tierForSpend,
} from "@/lib/constants";
import { routeLead, type RoutableRep } from "@/lib/routing";

async function requireRep() {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    throw new Error("Unauthorized");
  }
  return session;
}

// Create a lead and auto-route it: Tier 1 -> senior reps, Tier 2/3 -> round-robin by load.
export async function createLead(formData: FormData) {
  await requireRep();

  const accountName = String(formData.get("accountName") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim() || null;
  const estAnnualSpend = Number(formData.get("estAnnualSpend") ?? 0);
  if (!accountName || !estAnnualSpend) return;

  const tier = tierForSpend(estAnnualSpend);

  const reps = await prisma.user.findMany({ where: { role: ROLE.REP } });
  const openByRep = await prisma.lead.groupBy({
    by: ["assignedRepId"],
    where: { status: { in: [LEAD_STATUS.NEW, LEAD_STATUS.CONTACTED, LEAD_STATUS.QUALIFYING] } },
    _count: { _all: true },
  });
  const loadMap = new Map(openByRep.map((r) => [r.assignedRepId, r._count._all]));
  const routable: RoutableRep[] = reps.map((r) => ({
    id: r.id,
    name: r.name,
    isSenior: r.isSenior,
    load: loadMap.get(r.id) ?? 0,
  }));

  const routed = routeLead(tier, routable);

  await prisma.lead.create({
    data: {
      accountName,
      industry,
      estAnnualSpend,
      tier,
      status: LEAD_STATUS.NEW,
      assignedRepId: routed?.repId ?? null,
      routedReason: routed?.reason ?? "Unrouted — no reps available",
    },
  });

  console.log(`[lead] ${accountName} (Tier ${tier}) → ${routed?.reason ?? "unrouted"}`);
  revalidatePath("/rep");
}

export async function setCallStatus(callId: string, status: string) {
  await requireRep();
  await prisma.videoCallRequest.update({ where: { id: callId }, data: { status } });
  console.log(`[video-call] request ${callId} → ${status}. No email sent (MVP).`);
  revalidatePath("/rep");
}

export async function acceptCall(callId: string) {
  await setCallStatus(callId, CALL_STATUS.ACCEPTED);
}
export async function rescheduleCall(callId: string) {
  await setCallStatus(callId, CALL_STATUS.RESCHEDULE);
}

export async function advanceLead(leadId: string) {
  await requireRep();
  const order: string[] = [
    LEAD_STATUS.NEW,
    LEAD_STATUS.CONTACTED,
    LEAD_STATUS.QUALIFYING,
    LEAD_STATUS.WON,
  ];
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  const idx = order.indexOf(lead.status);
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : lead.status;
  await prisma.lead.update({ where: { id: leadId }, data: { status: next } });
  revalidatePath("/rep");
}

// Publish (or save as draft) a bundle from selected AVAILABLE pieces.
export async function saveBundle(formData: FormData) {
  const session = await requireRep();

  const name = String(formData.get("name") ?? "").trim() || "Untitled bundle";
  const discountType = String(formData.get("discountType") ?? DISCOUNT_TYPE.PERCENT);
  const discountValue = Number(formData.get("discountValue") ?? 0);
  const productIds = formData.getAll("productIds").map(String).filter(Boolean);
  const publish = String(formData.get("publish") ?? "") === "1";

  if (productIds.length === 0) return;

  // Only AVAILABLE pieces can enter a bundle (one-of-one integrity).
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, status: PRODUCT_STATUS.AVAILABLE },
  });
  const validIds = products.map((p) => p.id);
  if (validIds.length === 0) return;

  const bundle = await prisma.bundle.create({
    data: {
      name,
      repId: session.id,
      discountType,
      discountValue,
      status: publish ? BUNDLE_STATUS.LIVE : BUNDLE_STATUS.DRAFT,
      products: { connect: validIds.map((id) => ({ id })) },
    },
  });

  // Publishing locks the pieces out of the catalog until the bundle ends.
  if (publish) {
    await prisma.product.updateMany({
      where: { id: { in: validIds } },
      data: { status: PRODUCT_STATUS.BUNDLED, bundleId: bundle.id },
    });
  } else {
    await prisma.product.updateMany({
      where: { id: { in: validIds } },
      data: { bundleId: bundle.id },
    });
  }

  console.log(`[bundle] ${publish ? "Published" : "Drafted"} "${name}" (${validIds.length} pieces).`);
  revalidatePath("/rep/bundles");
  revalidatePath("/portal");
  redirect("/rep/bundles");
}
