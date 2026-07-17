"use client";

import { useState, useTransition } from "react";

/**
 * Notes save via API — no `"use server"` imports (soft-nav safe).
 */
export function QuoteNotesForm({
  quoteId,
  adminNotes,
}: {
  quoteId: string;
  adminNotes: string;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(adminNotes);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <textarea
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Internal notes — not visible to the buyer."
        className="w-full rounded-chip border border-border bg-ground px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setMessage(null);
            start(async () => {
              const res = await fetch(`/api/staff/quotes/${quoteId}/notes`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ adminNotes: value }),
              });
              const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
              };
              if (!res.ok || data.error) {
                setError(data.error || "Could not save notes.");
                return;
              }
              setMessage(data.message || "Notes saved.");
            });
          }}
          className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save notes"}
        </button>
        {message ? <span className="text-[12px] text-[#4E9A6A]">{message}</span> : null}
        {error ? <span className="text-[12px] text-danger">{error}</span> : null}
      </div>
    </div>
  );
}
