import { logAudit } from "@/lib/firestore/audit";
import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { archiveSuggestedLot } from "@/lib/firestore/suggestedLots";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id: lotId } = await ctx.params;
  if (!lotId?.trim()) {
    return NextResponse.json({ error: "Missing lot id." }, { status: 400 });
  }

  try {
    await archiveSuggestedLot(lotId.trim(), session.email);
    await logAudit({ actor: session, action: "bundle.archived", entity: "bundle", entityId: lotId.trim() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not archive lot." },
      { status: 400 },
    );
  }
}
