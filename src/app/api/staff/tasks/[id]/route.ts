import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { ROLE } from "@/lib/constants";
import { addTaskNote, completeTask, getTaskById } from "@/lib/firestore/tasks";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

/**
 * Task actions: { action: "complete" } or { action: "note", text }.
 * The assignee, the task's creator, or any manager may act on a task.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const task = await getTaskById(String(id || "").trim());
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  const email = String(session.email || "").toLowerCase();
  const allowed =
    session.role === ROLE.MANAGER ||
    task.assignedToEmail === email ||
    task.createdByEmail.toLowerCase() === email;
  if (!allowed) {
    return NextResponse.json({ error: "This task isn't assigned to you." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string; text?: string };

  try {
    if (body.action === "complete") {
      await completeTask(task.id, { email: session.email, name: session.name || session.email });
      await logAudit({ actor: session, action: "task.completed", entity: "task", entityId: task.id });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "note") {
      const text = String(body.text || "").trim();
      if (!text) return NextResponse.json({ error: "Write a note first." }, { status: 400 });
      await addTaskNote(task.id, {
        text,
        byEmail: session.email,
        byName: session.name || session.email,
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update the task." },
      { status: 400 },
    );
  }
}
