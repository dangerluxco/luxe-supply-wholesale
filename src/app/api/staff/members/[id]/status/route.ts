import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { updateStaff } from "@/lib/firestore/staff";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== ROLE.MANAGER || session.source !== "firestore") {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const { id: staffId } = await ctx.params;
  if (!staffId?.trim()) {
    return NextResponse.json({ error: "Missing staff id." }, { status: 400 });
  }
  if (staffId.trim() === session.id) {
    return NextResponse.json(
      { error: "You cannot disable your own account." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const status = String(body.status || "").toLowerCase();
  if (status !== "active" && status !== "disabled") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    const staff = await updateStaff(staffId.trim(), {
      status,
      updatedBy: session.email,
    });
    await logAudit({
      actor: session,
      action: "staff.status",
      entity: "staff",
      entityId: staff.id,
      payload: { status: staff.status },
    });
    return NextResponse.json({
      ok: true,
      message: staff.status === "disabled" ? "Account disabled." : "Account re-enabled.",
      status: staff.status,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update status." },
      { status: 400 },
    );
  }
}
