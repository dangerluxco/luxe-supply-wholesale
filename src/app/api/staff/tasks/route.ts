import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { ROLE } from "@/lib/constants";
import { createTask } from "@/lib/firestore/tasks";
import { findStaffByEmail } from "@/lib/firestore/staff";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

/** Create a task (managers only) assigned to a staffer. */
export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  if (session.role !== ROLE.MANAGER) {
    return NextResponse.json({ error: "Managers only." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    detail?: string;
    assignedToEmail?: string;
  };
  const assignedToEmail = String(body.assignedToEmail || "").trim().toLowerCase();
  if (!assignedToEmail) {
    return NextResponse.json({ error: "Pick who this task is for." }, { status: 400 });
  }
  const staff = await findStaffByEmail(assignedToEmail);
  if (!staff || staff.status === "disabled") {
    return NextResponse.json({ error: "Staff member not found." }, { status: 400 });
  }

  try {
    const id = await createTask({
      title: String(body.title || ""),
      detail: body.detail,
      assignedToEmail,
      assignedToName: staff.displayName || staff.email,
      createdByEmail: session.email,
      createdByName: session.name || session.email,
    });
    await logAudit({
      actor: session,
      action: "task.created",
      entity: "task",
      entityId: id,
      payload: { assignedToEmail, title: String(body.title || "").slice(0, 80) },
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the task." },
      { status: 400 },
    );
  }
}
