"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fullDate } from "@/lib/format";
import type { TaskItem } from "@/lib/firestore/tasks";

/**
 * Dashboard tasks: open tasks assigned to the signed-in staffer (managers also
 * see everyone's open tasks and get an assign form). Complete or add notes
 * inline — part of the dashboard's "needs attention" column.
 */
export function TasksPanel({
  tasks,
  currentEmail,
  isManager,
}: {
  tasks: TaskItem[];
  currentEmail: string;
  isManager: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Manager assign form
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [assignee, setAssignee] = useState("");
  const [staffOptions, setStaffOptions] = useState<Array<{ email: string; displayName: string }>>([]);

  useEffect(() => {
    if (!isManager || !showCreate || staffOptions.length) return;
    fetch("/api/staff/directory", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { staff?: Array<{ email: string; displayName: string }> }) => {
        if (Array.isArray(d.staff)) setStaffOptions(d.staff);
      })
      .catch(() => {});
  }, [isManager, showCreate, staffOptions.length]);

  function act(id: string, payload: { action: string; text?: string }) {
    setError(null);
    setBusyId(id);
    start(async () => {
      const res = await fetch(`/api/staff/tasks/${id}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setBusyId(null);
      if (!res.ok || data.error) {
        setError(data.error || "Could not update the task.");
        return;
      }
      setNoteFor(null);
      setNoteText("");
      router.refresh();
    });
  }

  function createTask() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/staff/tasks", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, detail, assignedToEmail: assignee }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not create the task.");
        return;
      }
      setTitle("");
      setDetail("");
      setAssignee("");
      setShowCreate(false);
      router.refresh();
    });
  }

  const mine = tasks.filter((t) => t.assignedToEmail === currentEmail);
  const others = isManager ? tasks.filter((t) => t.assignedToEmail !== currentEmail) : [];

  if (!tasks.length && !isManager) return null;

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[14px] font-semibold text-ink">
          Tasks
          {tasks.length ? (
            <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#6E5A30]">
              {tasks.length} open
            </span>
          ) : null}
        </div>
        {isManager ? (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent hover:underline"
          >
            {showCreate ? "Close" : "+ Assign task"}
          </button>
        ) : null}
      </div>

      {error ? <div className="mb-2 text-[11.5px] text-danger">{error}</div> : null}

      {isManager && showCreate ? (
        <div className="mb-4 space-y-2 rounded-chip border border-border bg-ground/50 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            className="h-9 w-full rounded-chip border border-border bg-surface px-3 text-[12.5px] text-ink outline-none focus:border-accent"
          />
          <textarea
            rows={2}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Details (optional)"
            className="w-full rounded-chip border border-border bg-surface px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="h-9 flex-1 rounded-chip border border-border bg-surface px-2 text-[12px] text-ink outline-none focus:border-accent"
            >
              <option value="">Assign to…</option>
              {staffOptions.map((s) => (
                <option key={s.email} value={s.email}>
                  {s.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!title.trim() || !assignee}
              onClick={createTask}
              className="h-9 rounded-chip bg-ink px-4 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90 disabled:opacity-50"
            >
              Assign
            </button>
          </div>
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <p className="text-[12px] text-muted">No open tasks.</p>
      ) : (
        <div className="space-y-2.5">
          {[...mine, ...others].map((t) => (
            <div key={t.id} className="rounded-chip border border-border bg-ground/40 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink">{t.title}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted">
                    {t.assignedToEmail === currentEmail
                      ? `from ${t.createdByName}`
                      : `→ ${t.assignedToName}`}{" "}
                    · {fullDate(t.createdAt)}
                  </div>
                  {t.detail ? <div className="mt-1 text-[11.5px] text-secondary">{t.detail}</div> : null}
                  {t.notes.length > 0 ? (
                    <div className="mt-1.5 space-y-1 border-l-2 border-border pl-2">
                      {t.notes.map((n, i) => (
                        <div key={i} className="text-[11px] text-secondary">
                          {n.text}
                          <span className="ml-1.5 font-mono text-[9.5px] text-muted">
                            — {n.byName}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busyId === t.id}
                  onClick={() => act(t.id, { action: "complete" })}
                  className="shrink-0 rounded-chip bg-ink px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90 disabled:opacity-50"
                >
                  {busyId === t.id ? "…" : "✓ Done"}
                </button>
              </div>
              {noteFor === t.id ? (
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note…"
                    autoFocus
                    className="h-8 flex-1 rounded-chip border border-border bg-surface px-2.5 text-[11.5px] text-ink outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    disabled={!noteText.trim() || busyId === t.id}
                    onClick={() => act(t.id, { action: "note", text: noteText })}
                    className="h-8 rounded-chip border border-border px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNoteFor(t.id);
                    setNoteText("");
                  }}
                  className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-ink"
                >
                  + Note
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
