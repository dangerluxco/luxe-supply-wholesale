"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { money } from "@/lib/format";
import type { PipelineColumn, PipelineTableRow } from "@/lib/repDashboard";

const STATUS_COLOR: Record<string, string> = {
  open: "#4E9A6A",
  contacted: "#B08D3E",
  quoted: "#3A7CA5",
  timed_out: "#8B897F",
};

/**
 * Statuses a rep can move a request between by dragging on the board. "Invoiced"
 * (quoted) and "Timed out" are system-driven — quoted is set when an invoice is
 * generated, timed_out by the auto-expiry job — so their cards aren't draggable
 * and those columns aren't drop targets.
 */
const DRAGGABLE = new Set(["open", "contacted"]);

export function RepPipelineBoard({
  columns,
  table,
}: {
  columns: PipelineColumn[];
  table: PipelineTableRow[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"board" | "table">("board");
  const [cols, setCols] = useState(columns);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  // Resync when the server re-renders the dashboard (e.g. after router.refresh()).
  useEffect(() => {
    setCols(columns);
  }, [columns]);

  const openCount = cols.find((c) => c.key === "open")?.count ?? 0;
  const invoicedCount = cols.find((c) => c.key === "quoted")?.count ?? 0;

  function moveQuoteStatus(quoteId: string, fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    if (!DRAGGABLE.has(fromKey) || !DRAGGABLE.has(toKey)) return;
    const prev = cols;
    const card = prev.find((c) => c.key === fromKey)?.cards.find((c) => c.id === quoteId);
    if (!card) return;

    setError(null);
    // Optimistic move between columns (+ adjust counts) for instant feedback.
    setCols((cs) =>
      cs.map((c) => {
        if (c.key === fromKey) {
          return {
            ...c,
            count: Math.max(0, c.count - 1),
            cards: c.cards.filter((x) => x.id !== quoteId),
          };
        }
        if (c.key === toKey) {
          return { ...c, count: c.count + 1, cards: [card, ...c.cards].slice(0, 6) };
        }
        return c;
      }),
    );

    start(async () => {
      const res = await fetch(`/api/staff/quotes/${quoteId}/status`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toKey }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok || data.error) {
        setCols(prev); // revert
        setError(data.error || "Could not update status.");
        return;
      }
      // Sync the rest of the dashboard (metrics, needs-attention) and bust the
      // route cache so the move doesn't look stale on back-navigation.
      router.refresh();
    });
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-ink">Order request pipeline</div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {openCount} open · {invoicedCount} invoiced
            {view === "board" ? (
              <span className="text-muted/70"> · drag between Open and Contacted to update</span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-1 rounded-chip border border-border p-0.5">
          {(["board", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={clsx(
                "rounded-[6px] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition",
                view === v ? "bg-ink text-ground" : "text-muted hover:text-ink",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-chip border border-danger/40 bg-danger/5 px-3 py-2 text-[11.5px] text-danger">
          {error}
        </div>
      ) : null}

      {view === "board" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cols.map((col) => {
            const droppable = DRAGGABLE.has(col.key);
            return (
              <div
                key={col.key}
                onDragOver={
                  droppable
                    ? (e) => {
                        e.preventDefault();
                        setDragOverKey(col.key);
                      }
                    : undefined
                }
                onDragLeave={
                  droppable ? () => setDragOverKey((k) => (k === col.key ? null : k)) : undefined
                }
                onDrop={
                  droppable
                    ? (e) => {
                        e.preventDefault();
                        setDragOverKey(null);
                        const quoteId = e.dataTransfer.getData("text/quote-id");
                        const fromKey = e.dataTransfer.getData("text/from-status");
                        if (quoteId && fromKey) moveQuoteStatus(quoteId, fromKey, col.key);
                      }
                    : undefined
                }
                className={clsx(
                  "rounded-chip border p-3 transition",
                  dragOverKey === col.key
                    ? "border-accent bg-accent/5"
                    : "border-border/70 bg-ground/40",
                )}
              >
                <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_COLOR[col.key] || "#8B897F" }}
                    />
                    {col.label}
                  </span>
                  <span>{col.count}</span>
                </div>
                {col.cards.length === 0 ? (
                  <div className="rounded-chip border border-dashed border-border/60 px-2.5 py-4 text-center text-[11px] text-muted">
                    {droppable ? "Drop here" : "Nothing here — good sign"}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {col.cards.map((card) => (
                      <a
                        key={card.id}
                        href={card.href}
                        draggable={droppable}
                        onDragStart={
                          droppable
                            ? (e) => {
                                e.dataTransfer.setData("text/quote-id", card.id);
                                e.dataTransfer.setData("text/from-status", col.key);
                                e.dataTransfer.effectAllowed = "move";
                              }
                            : undefined
                        }
                        className={clsx(
                          "block rounded-chip border border-border bg-surface px-2.5 py-2 text-[12px] transition hover:border-accent",
                          droppable && "cursor-grab active:cursor-grabbing",
                        )}
                      >
                        <div className="truncate font-semibold text-ink">{card.name}</div>
                        <div className="mt-0.5 truncate text-[10.5px] text-muted">{card.subtitle}</div>
                        <div className="mt-1 font-mono text-[12px] font-semibold text-ink">
                          {money(card.total)}
                        </div>
                      </a>
                    ))}
                    {col.count > col.cards.length ? (
                      <a
                        href={`/wholesaleportal/rep?status=${col.key}`}
                        className="block text-center text-[10.5px] text-muted hover:text-ink"
                      >
                        +{col.count - col.cards.length} more · view all
                      </a>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-chip border border-border">
          {table.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-muted">
              No order requests in the pipeline right now.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_60px_90px_110px_80px_64px] gap-x-3 border-b border-border bg-ground px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <span>Customer</span>
                <span className="text-center">Items</span>
                <span className="text-right">Total</span>
                <span>Status</span>
                <span className="text-center">Waiting</span>
                <span className="text-right"> </span>
              </div>
              {table.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_60px_90px_110px_80px_64px] items-center gap-x-3 border-b border-border/60 px-4 py-3 text-[12.5px] transition last:border-b-0 hover:bg-ground/70"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">{row.name}</div>
                    <div className="truncate font-mono text-[11px] text-muted">{row.email || "—"}</div>
                  </div>
                  <span className="text-center font-mono">{row.itemCount}</span>
                  <span className="text-right font-mono">{money(row.total)}</span>
                  <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_COLOR[row.statusKey] || "#8B897F" }}
                    />
                    {row.statusLabel}
                  </span>
                  <span className="text-center font-mono text-muted">{row.waiting}</span>
                  <div className="text-right">
                    <a
                      href={row.href}
                      className="inline-flex h-7 items-center rounded-chip bg-ink px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90"
                    >
                      Open
                    </a>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
