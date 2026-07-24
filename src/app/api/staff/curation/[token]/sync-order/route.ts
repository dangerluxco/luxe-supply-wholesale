import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getCurationShareForStaff } from "@/lib/firestore/curation";
import { syncQuoteItemsFromCuration } from "@/lib/curationOrderSync";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

/**
 * Explicit mid-call "Update order request": sync the linked order's line
 * items to the call's current decisions/prices WITHOUT ending the session.
 * Same rules as the end-of-session auto-sync (declines come off + holds
 * released; live-adds join once approved; prices flow through).
 */
export async function POST(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const share = await getCurationShareForStaff(token);
  if (!share) {
    return NextResponse.json({ error: "This curation link is unavailable." }, { status: 404 });
  }
  if (share.revoked) {
    return NextResponse.json({ error: "This curation link has been revoked." }, { status: 400 });
  }
  if (!share.quoteId) {
    return NextResponse.json(
      { error: "No order request is linked to this curation session." },
      { status: 400 },
    );
  }

  try {
    const { removedCount, itemCount } = await syncQuoteItemsFromCuration(
      share.quoteId,
      share.items,
      session.email,
    );
    await logAudit({
      actor: session,
      action: "curation.order_synced",
      entity: "curation",
      entityId: token,
      payload: { quoteId: share.quoteId, itemCount, removedCount },
    });
    return NextResponse.json({ ok: true, quoteId: share.quoteId, itemCount, removedCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update the order request." },
      { status: 400 },
    );
  }
}
