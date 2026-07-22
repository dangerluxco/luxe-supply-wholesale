import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { markCallRequestHandled } from "@/lib/firestore/callRequests";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const requestId = String(id || "").trim();
  if (!requestId) {
    return NextResponse.json({ error: "Missing request id." }, { status: 400 });
  }
  try {
    await markCallRequestHandled(requestId, session.email);
    await logAudit({
      actor: session,
      action: "callRequest.handled",
      entity: "callRequest",
      entityId: requestId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update." },
      { status: 400 },
    );
  }
}
