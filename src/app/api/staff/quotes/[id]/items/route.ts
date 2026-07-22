import { addQuoteActivity } from "@/lib/firestore/quoteActivities";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import {
  expandQuoteItemSkus,
  getQuoteById,
  updateQuoteItems,
  type QuoteItemInput,
} from "@/lib/firestore/quotes";
import { releaseQuoteHoldsForSkus } from "@/lib/firestore/holds";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (
    !session ||
    session.source !== "firestore" ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id } = await params;
  const quoteId = String(id || "").trim();
  if (!quoteId) {
    return NextResponse.json({ error: "Missing order request." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { items?: QuoteItemInput[] } | null;
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Invalid items." }, { status: 400 });
  }

  try {
    const before = await getQuoteById(quoteId);
    if (!before) {
      return NextResponse.json({ error: "Order request not found." }, { status: 404 });
    }

    const keepSkus = new Set(
      body.items.flatMap((i) => expandQuoteItemSkus(i as Record<string, unknown>)),
    );
    const removedSkus = before.items
      .flatMap((it) => expandQuoteItemSkus(it))
      .filter((sku) => !keepSkus.has(sku));

    await updateQuoteItems(quoteId, body.items, session.email);

    if (removedSkus.length) {
      try {
        await releaseQuoteHoldsForSkus(quoteId, removedSkus);
      } catch (err) {
        console.warn("[api items] hold release:", err);
      }
    }

    await addQuoteActivity({
      quoteId,
      type: "items_edited",
      text: `Line items updated (${body.items.length} item${body.items.length === 1 ? "" : "s"})`,
      staffEmail: session.email,
      staffName: session.name || session.email,
    }).catch(() => {});
    return NextResponse.json({ ok: true, message: "Order request updated." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update order request." },
      { status: 400 },
    );
  }
}
