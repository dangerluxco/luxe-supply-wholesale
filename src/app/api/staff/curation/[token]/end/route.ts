import { logAudit } from "@/lib/firestore/audit";
import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { endCurationSession } from "@/lib/firestore/curation";
import { syncQuoteItemsFromCuration } from "@/lib/curationOrderSync";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  try {
    const { revision, summary, quoteId, linkedBuyerId, items, approvedItems } =
      await endCurationSession(token);

    // If this link came from "Book call" on an existing order, sync that
    // order's line items to match the call's outcome: only items the buyer
    // explicitly declined come off (holds released); approved, "maybe", and
    // never-acted-on items all stay on the order with whatever price the
    // rep landed on during the call.
    let orderSynced = false;
    let orderSyncError: string | null = null;
    let removedCount = 0;
    if (quoteId) {
      try {
        const result = await syncQuoteItemsFromCuration(quoteId, items, session.email);
        removedCount = result.removedCount;
        orderSynced = true;
      } catch (err) {
        orderSyncError = err instanceof Error ? err.message : "Could not sync the order request.";
      }
    }

    // Ad-hoc session (no order yet) with a buyer picked via "Book call" and at
    // least one approved item — offer to create a new order request from it.
    // Staff confirms this explicitly; it never happens automatically.
    const canCreateOrder = !quoteId && !!linkedBuyerId && approvedItems.length > 0;

    await logAudit({
      actor: session,
      action: "curation.ended",
      entity: "curation",
      entityId: token,
      payload: { approved: approvedItems.length },
    });
    return NextResponse.json({
      ok: true,
      revision,
      summary,
      quoteId,
      orderSynced,
      orderSyncError,
      removedCount,
      canCreateOrder,
      approvedCount: approvedItems.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not end session." },
      { status: 400 },
    );
  }
}
