"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fullDate } from "@/lib/format";
import type { CallRequestItem } from "@/lib/firestore/callRequests";

/** Rep-dashboard panel listing pending buyer call/viewing requests. */
export function CallRequestsPanel({ requests }: { requests: CallRequestItem[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!requests.length) return null;

  function markHandled(id: string) {
    setError(null);
    setBusyId(id);
    start(async () => {
      const res = await fetch(`/api/staff/call-requests/${id}/handled`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setBusyId(null);
      if (!res.ok || data.error) {
        setError(data.error || "Could not update.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mb-6 rounded-card border border-accent/40 bg-accent/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[14px] font-semibold text-ink">
          Buyer call requests
          <span className="ml-2 rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-semibold text-ink">
            {requests.length}
          </span>
        </div>
      </div>
      {error ? <div className="mb-2 text-[11.5px] text-danger">{error}</div> : null}
      <div className="space-y-2">
        {requests.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center gap-3 rounded-chip border border-border bg-surface px-3.5 py-2.5 text-[12.5px]"
          >
            <div className="min-w-0 flex-1">
              <div className="text-ink">
                <span className="font-semibold">{r.buyerDisplayName}</span> wants a call about{" "}
                <Link
                  href={`/wholesale/product/${encodeURIComponent(r.sku)}`}
                  className="text-accent underline"
                >
                  {r.title}
                </Link>
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-muted">
                {r.sku} · {fullDate(r.createdAt)}
                {r.preferredTimes ? ` · prefers: ${r.preferredTimes}` : ""}
              </div>
              {r.note ? <div className="mt-1 text-[11.5px] text-secondary">{r.note}</div> : null}
            </div>
            {r.buyerEmail ? (
              <a
                href={`mailto:${r.buyerEmail}?subject=${encodeURIComponent(`Call about ${r.title} — Luxe Supply Co.`)}`}
                className="h-7 rounded-chip border border-border px-2.5 text-[10px] font-semibold uppercase leading-7 tracking-[0.1em] text-secondary transition hover:border-accent hover:text-ink"
              >
                Email buyer
              </a>
            ) : null}
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => markHandled(r.id)}
              className="h-7 rounded-chip bg-ink px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90 disabled:opacity-50"
            >
              {busyId === r.id ? "Saving…" : "Mark handled"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
