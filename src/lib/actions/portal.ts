"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { QUOTE_STATUSES, ROLE } from "@/lib/constants";
import { updateQuoteStatus } from "@/lib/firestore/quotes";
import { saveCatalogSelection } from "@/lib/firestore/catalog";
import { createBuyer } from "@/lib/firestore/buyers";

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
  revalidatePath(`/wholesaleportal/rep/quotes/${quoteId}`);
  return { ok: true };
}

export async function saveQuoteNotes(
  _prev: { error?: string; message?: string } | undefined,
  formData: FormData,
) {
  const session = await getSession();
  if (!session || session.source !== "firestore") {
    return { error: "Staff session required." };
  }
  const quoteId = String(formData.get("quoteId") || "").trim();
  if (!quoteId) return { error: "Missing quote id." };
  const adminNotes = String(formData.get("adminNotes") || "");

  await updateQuoteStatus(quoteId, { adminNotes }, session.email);
  revalidatePath(`/wholesaleportal/rep/quotes/${quoteId}`);
  revalidatePath("/wholesaleportal/rep");
  return { ok: true, message: "Notes saved." };
}

export async function inviteBuyer(
  _prev:
    | { error?: string; message?: string; username?: string; temporaryPassword?: string }
    | undefined,
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

  try {
    const { buyer, temporaryPassword } = await createBuyer({
      email: String(formData.get("email") || ""),
      username: String(formData.get("username") || ""),
      displayName: String(formData.get("displayName") || ""),
      company: String(formData.get("company") || ""),
      phone: String(formData.get("phone") || ""),
      password: String(formData.get("password") || ""),
      createdBy: session.email,
    });
    revalidatePath("/wholesaleportal/rep/clients");
    return {
      ok: true,
      message: `Buyer @${buyer.username} created.`,
      username: buyer.username,
      temporaryPassword,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create buyer." };
  }
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
