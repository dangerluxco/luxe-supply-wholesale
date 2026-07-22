import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { assignCallRequest, getCallRequestById } from "@/lib/firestore/callRequests";
import { findStaffByEmail } from "@/lib/firestore/staff";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

/** Assign a pending call request to a staffer (empty staffEmail unassigns). */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const requestId = String(id || "").trim();
  const body = (await request.json().catch(() => ({}))) as { staffEmail?: string };
  const staffEmail = String(body.staffEmail || "").trim().toLowerCase();

  const callRequest = await getCallRequestById(requestId);
  if (!callRequest || callRequest.status !== "pending") {
    return NextResponse.json({ error: "Call request not found or already closed." }, { status: 404 });
  }

  let assignee = { email: "", name: "" };
  if (staffEmail) {
    const staff = await findStaffByEmail(staffEmail);
    if (!staff || staff.status === "disabled") {
      return NextResponse.json({ error: "Staff member not found." }, { status: 400 });
    }
    assignee = { email: staff.email, name: staff.displayName || staff.email };
  }

  try {
    await assignCallRequest(requestId, assignee);
    await logAudit({
      actor: session,
      action: "callRequest.assigned",
      entity: "callRequest",
      entityId: requestId,
      payload: { assignee: assignee.email || "(unassigned)" },
    });
    return NextResponse.json({ ok: true, assignee });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not assign." },
      { status: 400 },
    );
  }
}
