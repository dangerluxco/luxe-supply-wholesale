"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import { money } from "@/lib/format";
import type { PipelineColumn, PipelineTableRow } from "@/lib/repDashboard";

const STATUS_COLOR: Record<string, string> = {
  open: "#4E9A6A",
  contacted: "#B08D3E",
  quoted: "#3A7CA5",
  timed_out: "#8B897F",
};

export function RepPipelineBoard({
  columns,
  table,
}: {
  columns: PipelineColumn[];
  table: PipelineTableRow[];
}) {
  const [view, setView] = useState<"board" | "table">("board");
  const openCount = columns.find((c) => c.key === "open")?.count ?? 0;
  const invoicedCount = columns.find((c) => c.key === "quoted")?.count ?? 0;

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-ink">Order request pipeline</div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {openCount} open · {invoicedCount} invoiced
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

      {view === "board" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {columns.map((col) => (
            <div key={col.key} className="rounded-chip border border-border/70 bg-ground/40 p-3">
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
                  Nothing here — good sign
                </div>
              ) : (
                <div className="space-y-2">
                  {col.cards.map((card) => (
                    <a
                      key={card.id}
                      href={card.href}
                      className="block rounded-chip border border-border bg-surface px-2.5 py-2 text-[12px] transition hover:border-accent"
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
          ))}
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
