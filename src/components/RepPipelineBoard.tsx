"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { money, fullDate } from "@/lib/format";
import type { PipelineColumn, PipelineTableRow } from "@/lib/repDashboard";
import type { CallRequestItem } from "@/lib/firestore/callRequests";

const STATUS_COLOR: Record<string, string> = {
  call_request: "#8E6FAD",
  open: "#4E9A6A",
  contacted: "#B08D3E",
  quoted: "#3A7CA5",
  fulfilled: "#B08D3E",
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
  callRequests = [],
}: {
  columns: PipelineColumn[];
  table: PipelineTableRow[];
  /** Pending buyer call/viewing requests — shown as the pipeline's initial phase. */
  callRequests?: CallRequestItem[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"board" | "table">("board");
  const [cols, setCols] = useState(columns);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCallId, setBusyCallId] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<CallRequestItem | null>(null);
  const [staffOptions, setStaffOptions] = useState<Array<{ email: string; displayName: string }>>([]);
  const [, start] = useTransition();

  // Staff list for the inline assign dropdown — only fetched when the
  // call-request column is on screen.
  useEffect(() => {
    if (!callRequests.length) return;
    let cancelled = false;
    fetch("/api/staff/directory", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { staff?: Array<{ email: string; displayName: string }> }) => {
        if (!cancelled && Array.isArray(d.staff)) setStaffOptions(d.staff);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [callRequests.length]);

  function callRequestAction(id: string, path: "handled" | "assign" | "convert", body?: unknown) {
    setError(null);
    setBusyCallId(id);
    start(async () => {
      const res = await fetch(`/api/staff/call-requests/${id}/${path}`, {
        method: "POST",
        credentials: "same-origin",
        ...(body !== undefined
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setBusyCallId(null);
      if (!res.ok || data.error) {
        setError(data.error || "Could not update the call request.");
        return;
      }
      setDetailRequest(null);
      router.refresh();
    });
  }

  function markCallHandled(id: string) {
    callRequestAction(id, "handled");
  }

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
            {callRequests.length > 0 ? `${callRequests.length} call request${callRequests.length === 1 ? "" : "s"} · ` : ""}
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
        <div
          className={clsx(
            "grid grid-cols-1 gap-3 sm:grid-cols-2",
            callRequests.length > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4",
          )}
        >
          {callRequests.length > 0 ? (
            <div className="rounded-chip border border-border/70 bg-ground/40 p-3">
              <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_COLOR.call_request }}
                  />
                  Call request
                </span>
                <span>{callRequests.length}</span>
              </div>
              <div className="space-y-2">
                {callRequests.slice(0, 6).map((r) => (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/call-request-id", r.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => setDetailRequest(r)}
                    className="cursor-pointer rounded-chip border border-border bg-surface px-2.5 py-2 text-[12px] transition hover:border-accent active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-2">
                      {r.imageUrl ? (
                        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-border">
                          <Image
                            src={r.imageUrl}
                            alt=""
                            fill
                            sizes="36px"
                            draggable={false}
                            className="object-cover"
                          />
                        </span>
                      ) : null}
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{r.buyerDisplayName}</div>
                        <div className="mt-0.5 truncate text-[10.5px] text-muted">
                          {r.title}
                          {r.preferredTimes ? ` · prefers ${r.preferredTimes}` : ""}
                        </div>
                      </div>
                    </div>
                    <select
                      value={r.assignedToEmail || ""}
                      disabled={busyCallId === r.id}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        callRequestAction(r.id, "assign", { staffEmail: e.target.value });
                      }}
                      className="mt-1.5 h-6 w-full rounded border border-border bg-ground px-1 text-[10.5px] text-secondary outline-none focus:border-accent disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {staffOptions.map((s) => (
                        <option key={s.email} value={s.email}>
                          {s.displayName}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1.5 flex items-center gap-2">
                      {r.buyerEmail ? (
                        <a
                          href={`mailto:${r.buyerEmail}?subject=${encodeURIComponent(
                            `Call about ${r.title} — Luxe Supply Co.`,
                          )}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent hover:underline"
                        >
                          Email
                        </a>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyCallId === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          markCallHandled(r.id);
                        }}
                        className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted transition hover:text-ink disabled:opacity-50"
                      >
                        {busyCallId === r.id ? "Saving…" : "✓ Handled"}
                      </button>
                    </div>
                  </div>
                ))}
                {callRequests.length > 6 ? (
                  <div className="text-center text-[10.5px] text-muted">
                    +{callRequests.length - 6} more
                  </div>
                ) : null}
                <div className="pt-1 text-center text-[9.5px] text-muted/80">
                  drag to Open to start an order request
                </div>
              </div>
            </div>
          ) : null}
          {cols.map((col) => {
            const droppable = DRAGGABLE.has(col.key);
            return (
              <div
                key={col.key}
                onDragOver={
                  droppable
                    ? (e) => {
                        // Call requests can only land on Open (they convert into
                        // an order request there); quote cards use DRAGGABLE.
                        const isCallDrag = e.dataTransfer.types.includes("text/call-request-id");
                        if (isCallDrag && col.key !== "open") return;
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
                        const callRequestId = e.dataTransfer.getData("text/call-request-id");
                        if (callRequestId) {
                          if (col.key === "open") callRequestAction(callRequestId, "convert");
                          return;
                        }
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

      {detailRequest ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-6"
          onClick={() => setDetailRequest(null)}
        >
          <div
            className="w-[460px] max-w-full rounded-card border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="micro-badge mb-1 text-[10px] tracking-[0.14em] text-accent">
              CALL REQUEST
            </div>
            <div className="mb-4 flex items-center gap-3">
              {detailRequest.imageUrl ? (
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-chip border border-border">
                  <Image
                    src={detailRequest.imageUrl}
                    alt={detailRequest.title}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </span>
              ) : null}
              <div className="text-[15px] font-semibold text-ink">{detailRequest.title}</div>
            </div>

            <div className="space-y-2.5 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <span className="text-muted">Buyer</span>
                <span className="text-right text-ink">
                  {detailRequest.buyerDisplayName}
                  {detailRequest.portalUsername ? (
                    <span className="ml-1.5 font-mono text-[11px] text-muted">
                      @{detailRequest.portalUsername}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Email</span>
                <span className="text-right font-mono text-[11.5px] text-ink">
                  {detailRequest.buyerEmail || "—"}
                </span>
              </div>
              {detailRequest.items.length > 1 ? (
                <div>
                  <div className="mb-1 text-muted">Pieces ({detailRequest.items.length})</div>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-chip border border-border bg-ground p-2">
                    {detailRequest.items.map((it) => (
                      <div key={it.sku} className="flex items-center gap-2">
                        {it.imageUrl ? (
                          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded border border-border">
                            <Image src={it.imageUrl} alt="" fill sizes="32px" className="object-cover" />
                          </span>
                        ) : null}
                        <Link
                          href={`/wholesale/product/${encodeURIComponent(it.sku)}`}
                          className="min-w-0 truncate text-[12px] text-ink hover:text-accent"
                          onClick={() => setDetailRequest(null)}
                        >
                          {it.title}
                          <span className="ml-1.5 font-mono text-[10px] text-muted">{it.sku}</span>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Piece</span>
                  <Link
                    href={`/wholesale/product/${encodeURIComponent(detailRequest.sku)}`}
                    className="text-right text-accent underline"
                    onClick={() => setDetailRequest(null)}
                  >
                    {detailRequest.sku}
                  </Link>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-muted">Preferred times</span>
                <span className="text-right text-ink">{detailRequest.preferredTimes || "—"}</span>
              </div>
              {detailRequest.note ? (
                <div>
                  <div className="mb-1 text-muted">Buyer note</div>
                  <div className="rounded-chip border border-border bg-ground px-3 py-2 text-ink">
                    {detailRequest.note}
                  </div>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <span className="text-muted">Requested</span>
                <span className="text-right font-mono text-[11.5px] text-ink">
                  {fullDate(detailRequest.createdAt)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Assigned to</span>
                <span className="text-right text-ink">
                  {detailRequest.assignedToName || "Unassigned"}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyCallId === detailRequest.id}
                onClick={() => callRequestAction(detailRequest.id, "convert")}
                className="h-9 flex-1 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ground transition hover:opacity-90 disabled:opacity-50"
              >
                {busyCallId === detailRequest.id ? "Working…" : "Start order request"}
              </button>
              {detailRequest.buyerEmail ? (
                <a
                  href={`mailto:${detailRequest.buyerEmail}?subject=${encodeURIComponent(
                    `Call about ${detailRequest.title} — Luxe Supply Co.`,
                  )}`}
                  className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary transition hover:border-accent hover:text-ink"
                >
                  Email buyer
                </a>
              ) : null}
              <button
                type="button"
                disabled={busyCallId === detailRequest.id}
                onClick={() => markCallHandled(detailRequest.id)}
                className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-ink disabled:opacity-50"
              >
                ✓ Handled
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
