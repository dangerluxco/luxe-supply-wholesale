"use client";

import { useState, useTransition } from "react";

/**
 * Notes save via API — no `"use server"` imports (soft-nav safe).
 *
 * Default mode APPENDS a stamped note (server-side transaction), so two reps
 * adding call notes never clobber each other. "Edit all" switches to the old
 * whole-field overwrite for deliberate clean-ups.
 */
export function QuoteNotesForm({
  quoteId,
  adminNotes,
}: {
  quoteId: string;
  adminNotes: string;
}) {
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(adminNotes);
  const [draft, setDraft] = useState("");
  const [editAll, setEditAll] = useState(false);
  const [editValue, setEditValue] = useState(adminNotes);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function post(body: Record<string, string>, after: (savedNotes: string) => void) {
    setError(null);
    setMessage(null);
    start(async () => {
      const res = await fetch(`/api/staff/quotes/${quoteId}/notes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        adminNotes?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not save notes.");
        return;
      }
      after(data.adminNotes ?? "");
      setMessage(data.message || "Saved.");
    });
  }

  if (editAll) {
    return (
      <div className="space-y-3">
        <textarea
          rows={7}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          placeholder="Internal notes — not visible to the buyer."
          className="w-full rounded-chip border border-border bg-ground px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              post({ adminNotes: editValue }, (saved) => {
                setNotes(saved);
                setEditAll(false);
              })
            }
            className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save full notes"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditAll(false);
              setEditValue(notes);
            }}
            className="text-[11px] text-muted hover:text-ink"
          >
            Cancel
          </button>
          {message ? <span className="text-[12px] text-[#4E9A6A]">{message}</span> : null}
          {error ? <span className="text-[12px] text-danger">{error}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notes.trim() ? (
        <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-chip border border-border bg-ground px-3 py-2 font-sans text-[12.5px] leading-relaxed text-secondary">
          {notes}
        </pre>
      ) : (
        <p className="text-[12px] text-muted">No notes yet — not visible to the buyer.</p>
      )}
      <textarea
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note — it's stamped with your name and the time."
        className="w-full rounded-chip border border-border bg-ground px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !draft.trim()}
          onClick={() =>
            post({ append: draft }, (saved) => {
              setNotes(saved);
              setEditValue(saved);
              setDraft("");
            })
          }
          className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add note"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditAll(true);
            setEditValue(notes);
            setMessage(null);
            setError(null);
          }}
          className="text-[11px] text-muted hover:text-ink"
        >
          Edit all
        </button>
        {message ? <span className="text-[12px] text-[#4E9A6A]">{message}</span> : null}
        {error ? <span className="text-[12px] text-danger">{error}</span> : null}
      </div>
    </div>
  );
}
