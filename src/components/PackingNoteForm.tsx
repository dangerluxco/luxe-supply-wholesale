"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Seller → shipper note for one order ("fit it all in one box", "pack extra
 * careful"). Saves via fetch API (soft-nav safe); shown on the pack station.
 */
export function PackingNoteForm({
  invoiceId,
  initialNote,
}: {
  invoiceId: string;
  initialNote: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote);
  const [savedNote, setSavedNote] = useState(initialNote);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = note.trim() !== savedNote.trim();

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">
        NOTE TO SHIPPER
      </div>
      <p className="mb-2 text-[11.5px] text-muted">
        Shown on the fulfillment pack station for this order — packing preferences, box count,
        handling care.
      </p>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        rows={3}
        maxLength={1000}
        placeholder="e.g. Squeeze everything into one box · Pack extra careful — gift order"
        className="w-full rounded-chip border border-border bg-ground px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => {
            setError(null);
            start(async () => {
              try {
                const res = await fetch(
                  `/api/staff/invoices/${encodeURIComponent(invoiceId)}/packing-note`,
                  {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ note }),
                  },
                );
                const data = (await res.json().catch(() => ({}))) as {
                  error?: string;
                  packingNote?: string;
                };
                if (!res.ok || data.error) throw new Error(data.error || "Could not save.");
                setSavedNote(data.packingNote ?? note);
                setSaved(true);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not save.");
              }
            });
          }}
          className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ground disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save note"}
        </button>
        {saved && !dirty ? <span className="text-[11.5px] text-[#4E9A6A]">Saved.</span> : null}
        {error ? <span className="text-[11.5px] text-danger">{error}</span> : null}
      </div>
    </div>
  );
}
