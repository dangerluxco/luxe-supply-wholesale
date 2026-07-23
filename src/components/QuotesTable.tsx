"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { QuoteStatusSelect } from "@/components/QuoteStatusSelect";
import { QuoteClaimControls } from "@/components/QuoteClaimControls";

export type QuoteRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  username: string;
  itemCount: number;
  total: number | null;
  waiting: string;
  /** Days until the 7-day auto-timeout releases holds (active statuses only). */
  timesOutDays?: number | null;
  status: string;
  claimedByEmail: string | null;
  claimedByName: string | null;
};

/** Bulk targets: only rep-controlled statuses (Invoiced/Timed-out stay system-driven). */
const BULK_STATUSES = [
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
  { value: "declined", label: "Declined" },
];

/**
 * Order-request table with multi-select bulk actions (claim to me / set
 * status). Applies actions via the existing per-quote endpoints, sequentially,
 * then soft-refreshes.
 */
export function QuotesTable({
  rows,
  currentStaffEmail,
}: {
  rows: QuoteRow[];
  currentStaffEmail: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(label: string, fn: (id: string) => Promise<Response>) {
    setError(null);
    const ids = [...selected];
    start(async () => {
      let done = 0;
      const failures: string[] = [];
      for (const id of ids) {
        setProgress(`${label} ${done + 1}/${ids.length}…`);
        try {
          const res = await fn(id);
          if (!res.ok) failures.push(id);
        } catch {
          failures.push(id);
        }
        done += 1;
      }
      setProgress(null);
      setSelected(new Set());
      if (failures.length) setError(`${failures.length} of ${ids.length} failed — refresh and retry.`);
      router.refresh();
    });
  }

  return (
    <div>
      {selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-chip border border-accent/50 bg-accent/10 px-4 py-2.5 text-[12px]">
          <span className="font-semibold text-ink">{selected.size} selected</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              runBulk("Claiming", (id) =>
                fetch(`/api/staff/quotes/${id}/claim`, { method: "POST", credentials: "same-origin" }),
              )
            }
            className="h-7 rounded-chip bg-ink px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90 disabled:opacity-50"
          >
            Claim to me
          </button>
          <span className="text-muted">·</span>
          {BULK_STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={pending}
              onClick={() =>
                runBulk(`Setting ${s.label}`, (id) =>
                  fetch(`/api/staff/quotes/${id}/status`, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: s.value }),
                  }),
                )
              }
              className="h-7 rounded-chip border border-border bg-surface px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary transition hover:border-accent hover:text-ink disabled:opacity-50"
            >
              → {s.label}
            </button>
          ))}
          <div className="flex-1" />
          {progress ? <span className="font-mono text-[11px] text-muted">{progress}</span> : null}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[11px] text-muted underline hover:text-ink"
          >
            Clear
          </button>
        </div>
      ) : null}
      {error ? <div className="mb-2 text-[11.5px] text-danger">{error}</div> : null}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[36px_1fr_0.85fr_52px_72px_60px_110px_minmax(230px,1.3fr)_72px] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          <span>
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
              }
              className="h-3.5 w-3.5 accent-[#B08D3E]"
            />
          </span>
          <span>Customer</span>
          <span>Company / buyer</span>
          <span className="text-center">Items</span>
          <span className="text-right">Total</span>
          <span className="text-center">Waiting</span>
          <span>Status</span>
          <span>Assigned</span>
          <span className="text-right"> </span>
        </div>
        {rows.map((q) => (
          <div
            key={q.id}
            className="grid grid-cols-[36px_1fr_0.85fr_52px_72px_60px_110px_minmax(230px,1.3fr)_72px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] transition last:border-b-0 hover:bg-ground/70"
          >
            <span>
              <input
                type="checkbox"
                aria-label={`Select ${q.name}`}
                checked={selected.has(q.id)}
                onChange={() => toggle(q.id)}
                className="h-3.5 w-3.5 accent-[#B08D3E]"
              />
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{q.name}</div>
              <div className="truncate font-mono text-[11px] text-muted">{q.email || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate">{q.company || "—"}</div>
              <div className="font-mono text-[11px] text-muted">
                {q.username ? `@${q.username}` : "guest"}
              </div>
            </div>
            <div className="text-center font-mono">{q.itemCount}</div>
            <div className="text-right font-mono">
              {q.total != null ? money(Math.round(q.total)) : "—"}
            </div>
            <div className="text-center font-mono">
              <div className="text-muted">{q.waiting}</div>
              {q.timesOutDays != null ? (
                <div
                  className={`text-[10px] ${
                    q.timesOutDays <= 2 ? "font-semibold text-danger" : "text-muted"
                  }`}
                >
                  {q.timesOutDays <= 0
                    ? "times out today"
                    : `times out in ${q.timesOutDays}d`}
                </div>
              ) : null}
            </div>
            <QuoteStatusSelect quoteId={q.id} status={q.status} />
            <QuoteClaimControls
              quoteId={q.id}
              claimedByEmail={q.claimedByEmail}
              claimedByName={q.claimedByName}
              currentStaffEmail={currentStaffEmail}
              compact
            />
            <div className="text-right">
              <a
                href={`/wholesaleportal/rep/quotes/${q.id}`}
                className="pressable inline-flex h-8 items-center rounded-chip bg-ink px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ground hover:opacity-90"
              >
                Open
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
