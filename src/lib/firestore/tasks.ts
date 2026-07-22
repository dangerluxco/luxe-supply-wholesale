// Admin-assigned staff tasks — surfaced in the dashboard's Needs Attention
// column until completed. Stored in `salesPortalTasks`.
import { getDb, toIso } from "./admin";
import { getLuxesupplyOrg } from "./staff";

export type TaskNote = {
  text: string;
  byEmail: string;
  byName: string;
  at: string | null;
};

export type TaskItem = {
  id: string;
  title: string;
  detail: string;
  assignedToEmail: string;
  assignedToName: string;
  createdByEmail: string;
  createdByName: string;
  status: "open" | "done";
  notes: TaskNote[];
  createdAt: string | null;
  doneAt: string | null;
  doneBy: string;
};

function serialize(id: string, d: Record<string, unknown>): TaskItem {
  return {
    id,
    title: String(d.title || ""),
    detail: String(d.detail || ""),
    assignedToEmail: String(d.assignedToEmail || ""),
    assignedToName: String(d.assignedToName || d.assignedToEmail || ""),
    createdByEmail: String(d.createdByEmail || ""),
    createdByName: String(d.createdByName || d.createdByEmail || ""),
    status: String(d.status || "open") === "done" ? "done" : "open",
    notes: (Array.isArray(d.notes) ? (d.notes as Array<Record<string, unknown>>) : []).map((n) => ({
      text: String(n.text || ""),
      byEmail: String(n.byEmail || ""),
      byName: String(n.byName || n.byEmail || ""),
      at: toIso(n.at),
    })),
    createdAt: toIso(d.createdAt),
    doneAt: toIso(d.doneAt),
    doneBy: String(d.doneBy || ""),
  };
}

export async function createTask(opts: {
  title: string;
  detail?: string;
  assignedToEmail: string;
  assignedToName: string;
  createdByEmail: string;
  createdByName: string;
}): Promise<string> {
  const title = String(opts.title || "").trim().slice(0, 200);
  if (!title) throw new Error("Task title is required.");
  const org = await getLuxesupplyOrg();
  const now = new Date();
  const ref = await getDb().collection("salesPortalTasks").add({
    organizationId: org.id,
    title,
    detail: String(opts.detail || "").trim().slice(0, 2000),
    assignedToEmail: opts.assignedToEmail.trim().toLowerCase(),
    assignedToName: opts.assignedToName,
    createdByEmail: opts.createdByEmail,
    createdByName: opts.createdByName,
    status: "open",
    notes: [],
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function listOpenTasks(opts?: { assignedToEmail?: string; limit?: number }): Promise<TaskItem[]> {
  const org = await getLuxesupplyOrg();
  const db = getDb();
  let q = db
    .collection("salesPortalTasks")
    .where("organizationId", "==", org.id)
    .where("status", "==", "open");
  if (opts?.assignedToEmail) {
    q = q.where("assignedToEmail", "==", opts.assignedToEmail.trim().toLowerCase());
  }
  let snap;
  try {
    snap = await q.orderBy("createdAt", "desc").limit(opts?.limit || 100).get();
  } catch {
    snap = await q.limit(opts?.limit || 100).get();
  }
  return snap.docs
    .map((doc) => serialize(doc.id, doc.data() || {}))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function getTaskById(id: string): Promise<TaskItem | null> {
  const snap = await getDb().collection("salesPortalTasks").doc(String(id || "").trim()).get();
  if (!snap.exists) return null;
  return serialize(snap.id, snap.data() || {});
}

export async function completeTask(id: string, by: { email: string; name: string }): Promise<void> {
  await getDb().collection("salesPortalTasks").doc(id).update({
    status: "done",
    doneAt: new Date(),
    doneBy: by.email,
    updatedAt: new Date(),
  });
}

export async function addTaskNote(
  id: string,
  note: { text: string; byEmail: string; byName: string },
): Promise<void> {
  const text = String(note.text || "").trim().slice(0, 1000);
  if (!text) return;
  const ref = getDb().collection("salesPortalTasks").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Task not found.");
  const existing = Array.isArray(snap.data()?.notes) ? (snap.data()!.notes as unknown[]) : [];
  await ref.update({
    notes: [...existing, { text, byEmail: note.byEmail, byName: note.byName, at: new Date() }],
    updatedAt: new Date(),
  });
}
