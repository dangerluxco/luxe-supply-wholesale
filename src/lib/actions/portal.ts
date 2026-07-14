"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { QUOTE_STATUSES, ROLE } from "@/lib/constants";
import {
  expandQuoteItemSkus,
  finalizeInvoiceRequestAsSold,
  getQuoteById,
  updateQuoteItems,
  updateQuoteStatus,
  type QuoteItemInput,
} from "@/lib/firestore/quotes";
import { releaseAllHoldsForQuote, releaseQuoteHoldsForSkus } from "@/lib/firestore/holds";
import {
  resolveCuratedDraftItems,
  saveCuratedCatalog,
  setCatalogMode,
  type CuratedCatalogItem,
} from "@/lib/firestore/catalog";
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

  // Invoiced / approved → treat as sold; declined or timed out → free inventory holds
  if (next === "quoted") {
    try {
      await finalizeInvoiceRequestAsSold(quoteId, session.email);
    } catch (err) {
      console.warn("[setQuoteStatus] finalize sold:", err);
    }
  } else if (next === "declined" || next === "timed_out" || next === "closed") {
    try {
      await releaseAllHoldsForQuote(quoteId);
    } catch (err) {
      console.warn("[setQuoteStatus] release holds:", err);
    }
  }

  revalidatePath("/wholesaleportal/rep");
  revalidatePath(`/wholesaleportal/rep/quotes/${quoteId}`);
  revalidatePath("/wholesale");
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

/**
 * Staff edit of an invoice request's line items: remove products and/or
 * adjust unit prices. Recomputes itemCount/cartTotal and best-effort releases
 * SKU holds for anything removed (won't fail the save if hold cleanup errors).
 */
export async function saveQuoteLineItems(quoteId: string, items: QuoteItemInput[]) {
  const session = await getSession();
  if (!session || session.source !== "firestore") {
    return { error: "Staff session required." };
  }
  const id = String(quoteId || "").trim();
  if (!id) return { error: "Missing invoice request id." };
  if (!Array.isArray(items)) return { error: "Invalid items." };

  try {
    const before = await getQuoteById(id);
    if (!before) return { error: "Invoice request not found." };

    const keepSkus = new Set(
      items.flatMap((i) => expandQuoteItemSkus(i as Record<string, unknown>)),
    );
    const removedSkus = before.items
      .flatMap((it) => expandQuoteItemSkus(it))
      .filter((sku) => !keepSkus.has(sku));

    await updateQuoteItems(id, items, session.email);

    if (removedSkus.length) {
      try {
        await releaseQuoteHoldsForSkus(id, removedSkus);
      } catch (err) {
        console.warn("[saveQuoteLineItems] hold release:", err instanceof Error ? err.message : err);
      }
    }

    revalidatePath("/wholesaleportal/rep");
    revalidatePath(`/wholesaleportal/rep/quotes/${id}`);
    return { ok: true, message: "Invoice request updated." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update invoice request." };
  }
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

function assertStaffSession(session: Awaited<ReturnType<typeof getSession>>) {
  return (
    !!session &&
    (session.role === "REP" || session.role === "MANAGER") &&
    session.source === "firestore"
  );
}

/** Quick switch between "all" (testing) and "sku_list" (curated) — never touches saved SKUs/curated data. */
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

/**
 * Step 1 of the curated catalog workflow: resolve pasted SKUs against the
 * inventory DB and return a draft review — nothing is saved yet.
 */
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

/**
 * Step 2: persist the reviewed items as the live curated catalog. Overwrites
 * any previously saved catalog entirely and switches the live mode to `sku_list`.
 */
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
