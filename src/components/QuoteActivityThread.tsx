"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fullDate } from "@/lib/format";
import type { QuoteActivity } from "@/lib/firestore/quoteActivities";

const TYPE_LABEL: Record<string, string> = {
  note: "Note",
  status_change: "Status",
  claim: "Claim",
  items_edited: "Items",
  shipping_edited: "Shipping",
  invoice_generated: "Invoice",
  call_requested: "Call",
};

/**
 * Timestamped activity thread for an order request (auto entries from status/
 * claim/invoice mutations + manual staff notes) — same pattern as leads.
 */
export function QuoteActivityThread({
  quoteId,
  activities,
}: {
  quoteId: string;
  activities: QuoteActivity[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 micro-badge text-[10px] tracking-[0.14em] text-accent">ACTIVITY</div>

      <div className="mb-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim() && !pending) {
              e.preventDefault();
              (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click();
            }
          }}
          placeholder="Add a note — call summary, follow-up, context…"
          className="h-9 flex-1 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() => {
            setError(null);
            start(async () => {
              const res = await fetch(`/api/staff/quotes/${quoteId}/activity`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
              });
              const data = (await res.json().catch(() => ({}))) as { error?: string };
              if (!res.ok || data.error) {
                setError(data.error || "Could not add note.");
                return;
              }
              setText("");
              router.refresh();
            });
          }}
          className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add"}
        </button>
      </div>
      {error ? <div className="mb-3 text-[11.5px] text-danger">{error}</div> : null}

      {activities.length === 0 ? (
        <p className="text-[12px] text-muted">No activity yet — notes and changes will appear here.</p>
      ) : (
        <div className="space-y-2.5">
          {activities.map((a) => (
            <div key={a.id} className="flex gap-2.5 text-[12.5px]">
              <span className="mt-0.5 shrink-0 rounded-full border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                {TYPE_LABEL[a.type] || a.type}
              </span>
              <div className="min-w-0">
                <div className="text-ink">{a.text}</div>
                <div className="font-mono text-[10px] text-muted">
                  {a.staffName} · {fullDate(a.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
