import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getCallRequestById, markCallRequestConverted } from "@/lib/firestore/callRequests";
import { createStaffQuote, claimQuote } from "@/lib/firestore/quotes";
import { findBuyerByIdentifier } from "@/lib/firestore/buyers";
import { getCatalogProductsBySkus } from "@/lib/firestore/catalog";
import { addQuoteActivity } from "@/lib/firestore/quoteActivities";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

/**
 * Convert a pending buyer call request into an open order request: creates a
 * staff quote for that buyer with the requested piece as its line item, claims
 * it for the call request's assignee (or the converting staffer), and closes
 * the call request as converted.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const callRequest = await getCallRequestById(String(id || "").trim());
  if (!callRequest || callRequest.status !== "pending") {
    return NextResponse.json({ error: "Call request not found or already closed." }, { status: 404 });
  }

  const buyer = await findBuyerByIdentifier(callRequest.portalUsername);
  if (!buyer) {
    return NextResponse.json(
      { error: "Buyer account not found for this request." },
      { status: 400 },
    );
  }

  // Best-effort price/imagery from the live catalog; the piece may have changed
  // state since the request, which is fine — staff adjust line items as needed.
  const products = await getCatalogProductsBySkus([callRequest.sku]).catch(
    () => new Map<string, never>(),
  );
  const product = products.get(callRequest.sku);

  try {
    const { id: quoteId } = await createStaffQuote({
      buyer: {
        id: buyer.id,
        username: buyer.username,
        displayName: buyer.displayName,
        email: buyer.email,
        company: buyer.company,
        phone: buyer.phone,
      },
      items: [
        {
          sku: callRequest.sku,
          title: callRequest.title,
          brand: product?.brand,
          price: Math.round(product?.price ?? 0),
          imageUrl: product?.imageUrl || null,
        },
      ],
      message: [
        `Converted from a buyer call request about ${callRequest.title}.`,
        callRequest.preferredTimes ? `Preferred times: ${callRequest.preferredTimes}` : "",
        callRequest.note ? `Buyer note: ${callRequest.note}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      createdByEmail: session.email,
      createdByDisplayName: session.name || session.email,
    });

    const claimant = callRequest.assignedToEmail
      ? { email: callRequest.assignedToEmail, name: callRequest.assignedToName || callRequest.assignedToEmail }
      : { email: session.email, name: session.name || session.email };
    await claimQuote(quoteId, claimant).catch(() => {});

    await addQuoteActivity({
      quoteId,
      type: "call_requested",
      text: `Created from ${callRequest.buyerDisplayName}'s call request about ${callRequest.title}${
        callRequest.preferredTimes ? ` (prefers ${callRequest.preferredTimes})` : ""
      }`,
      staffEmail: session.email,
      staffName: session.name || session.email,
    }).catch(() => {});

    await markCallRequestConverted(callRequest.id, quoteId, session.email);
    await logAudit({
      actor: session,
      action: "callRequest.converted",
      entity: "callRequest",
      entityId: callRequest.id,
      payload: { quoteId, sku: callRequest.sku },
    });

    return NextResponse.json({ ok: true, quoteId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not convert the call request." },
      { status: 400 },
    );
  }
}
