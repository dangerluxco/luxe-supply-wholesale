"use client";

import { useMemo, useState, useTransition } from "react";
import { money } from "@/lib/format";
import { portalDisplayTitle, portalShowSkuLine } from "@/components/PortalItemLine";
import { Placeholder } from "@/components/Placeholder";
import { TrashIcon } from "@/components/icons";

/**
 * Staff curation-share builder — fetch APIs only (no `"use server"`, soft-nav safe).
 * Paste SKUs → resolve against inventory → price/review → create a shareable,
 * time-limited link for a buyer to approve/decline items on their own.
 */

type DraftItem = {
  sku: string;
  title: string;
  brand: string;
  condition: string;
  imageUrl: string | null;
  imageUrls: string[];
  inDb: boolean;
  cost: number | null;
  price: number | null;
};

type ActiveShare = {
  token: string;
  clientName: string;
  invoiceDate: string;
  itemCount: number;
  sessionEnded: boolean;
  expiresAt: string | null;
  createdAt: string | null;
  items: Array<{ decision: string; price: number }>;
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function expiresLabel(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

/** Margin color bands matching the marketing-site review table: green ≥18%, amber below, red if negative. */
function marginColorClass(percent: number | null): string {
  if (percent == null) return "text-secondary";
  if (percent < 0) return "text-danger";
  if (percent < 18) return "text-accent";
  return "text-[#4E9A6A]";
}

function decisionCounts(items: Array<{ decision: string }>) {
  let approve = 0;
  let maybe = 0;
  let decline = 0;
  for (const it of items) {
    if (it.decision === "approve") approve += 1;
    else if (it.decision === "maybe") maybe += 1;
    else if (it.decision === "decline") decline += 1;
  }
  return { approve, maybe, decline, pending: items.length - approve - maybe - decline };
}

export function CurationBuilder({ initialShares }: { initialShares: ActiveShare[] }) {
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [skusText, setSkusText] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [clientName, setClientName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [note, setNote] = useState("");
  const [expiresHours, setExpiresHours] = useState(4);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shares, setShares] = useState(initialShares);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const total = useMemo(
    () => draft.reduce((sum, it) => sum + (it.price || 0), 0),
    [draft],
  );

  function resolveSkus() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/staff/curation/resolve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skusText }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: DraftItem[];
        missing?: string[];
      };
      if (!res.ok || data.error || !data.items) {
        setError(data.error || "Could not resolve SKUs.");
        return;
      }
      const seen = new Set(draft.map((d) => d.sku.toLowerCase()));
      const additions = data.items.filter((it) => !seen.has(it.sku.toLowerCase()));
      setDraft((prev) => [...prev, ...additions]);
      setMissing(data.missing || []);
      setSkusText("");
    });
  }

  function updatePrice(index: number, value: string) {
    const price = Number(value);
    setDraft((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, price: Number.isFinite(price) ? Math.max(0, price) : null } : it,
      ),
    );
  }

  function removeRow(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function startOver() {
    if (draft.length > 0 && !window.confirm("Clear this working list and start over?")) return;
    setDraft([]);
    setSkusText("");
    setMissing([]);
    setClientName("");
    setInvoiceDate("");
    setNote("");
    setExpiresHours(4);
    setError(null);
  }

  function createShare() {
    setError(null);
    if (!draft.length) {
      setError("Add at least one item before creating a link.");
      return;
    }
    const unpriced = draft.filter((it) => it.price == null || !(it.price > 0));
    if (unpriced.length) {
      setError(`${unpriced.length} item${unpriced.length === 1 ? "" : "s"} need a price above $0.`);
      return;
    }
    start(async () => {
      const res = await fetch("/api/staff/curation/create", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: draft.map((it) => ({
            sku: it.sku,
            title: it.title,
            brand: it.brand,
            condition: it.condition,
            cost: it.cost,
            price: it.price,
            imageUrl: it.imageUrl,
            imageUrls: it.imageUrls,
          })),
          clientName,
          invoiceDate,
          note,
          expiresHours,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        share?: { token: string };
      };
      if (!res.ok || data.error || !data.url || !data.share) {
        setError(data.error || "Could not create curation link.");
        return;
      }
      // Jump straight into the live manage view (stats, decisions, live-add) —
      // that's the "sales call" screen, not this builder.
      window.location.assign(`/wholesaleportal/rep/curation/${data.share.token}`);
    });
  }

  async function revokeShare(token: string, label: string) {
    if (
      !window.confirm(
        `Revoke the curation link for "${label || "this client"}"? They'll immediately lose access — this can't be undone.`,
      )
    ) {
      return;
    }
    setListError(null);
    setRevokingToken(token);
    try {
      const res = await fetch(`/api/staff/curation/${token}/revoke`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setListError(data.error || "Could not revoke that link.");
        return;
      }
      setShares((prev) => prev.filter((s) => s.token !== token));
    } catch {
      setListError("Could not revoke that link.");
    } finally {
      setRevokingToken(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-card border border-border bg-surface p-6">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
          1. PASTE SKUS
        </div>
        <p className="mt-1 text-[12.5px] text-secondary">
          Paste the SKUs you want to walk a client through — one per line, comma, or
          space-separated. Up to 200 at a time.
        </p>
        <textarea
          value={skusText}
          onChange={(e) => setSkusText(e.target.value)}
          rows={4}
          placeholder="SKU-001&#10;SKU-002&#10;SKU-003"
          className="mt-3 w-full rounded-chip border border-border bg-ground px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !skusText.trim()}
            onClick={resolveSkus}
            className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
          >
            {pending ? "Looking up…" : "Look up SKUs"}
          </button>
          {missing.length > 0 ? (
            <span className="text-[11.5px] text-danger">
              {missing.length} not found: {missing.slice(0, 6).join(", ")}
              {missing.length > 6 ? "…" : ""}
            </span>
          ) : null}
        </div>
      </div>

      {draft.length > 0 ? (
        <div className="rounded-card border border-border bg-surface p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
              2. REVIEW &amp; PRICE — {draft.length} ITEM{draft.length === 1 ? "" : "S"}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] text-ink">{money(Math.round(total))} total</span>
              <button
                type="button"
                onClick={startOver}
                className="text-[11px] uppercase tracking-[0.08em] text-muted hover:text-danger"
              >
                Start over
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-chip border border-border">
            <div className="grid grid-cols-[88px_minmax(160px,1fr)_90px_100px_110px_44px] items-center gap-x-3 border-b border-border bg-ground px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              <span />
              <span>Item</span>
              <span className="text-right">Cost</span>
              <span className="text-right">Price</span>
              <span className="text-right">Margin</span>
              <span />
            </div>
            <div className="max-h-[460px] overflow-y-auto">
              {draft.map((it, index) => {
                const margin =
                  it.cost != null && it.price != null ? it.price - it.cost : null;
                const marginPct =
                  margin != null && it.price != null && it.price > 0
                    ? (margin / it.price) * 100
                    : null;
                return (
                  <div
                    key={`${it.sku}-${index}`}
                    className="grid grid-cols-[88px_minmax(160px,1fr)_90px_100px_110px_44px] items-center gap-x-3 border-b border-border/60 px-3 py-2 text-[12.5px] last:border-b-0"
                  >
                    <Placeholder
                      imageSrc={it.imageUrl}
                      alt={portalDisplayTitle(it.title, it.sku)}
                      className="h-20 w-20 shrink-0 rounded-chip"
                    />
                    <div className="min-w-0 px-2">
                      <div className="truncate text-ink">{portalDisplayTitle(it.title, it.sku)}</div>
                      {portalShowSkuLine(it.title, it.sku) ? (
                        <div className="truncate font-mono text-[11px] text-muted">{it.sku}</div>
                      ) : null}
                      {!it.inDb ? (
                        <div className="text-[10.5px] uppercase tracking-[0.08em] text-danger">
                          Not found
                        </div>
                      ) : null}
                    </div>
                    <span className="text-right font-mono text-secondary">
                      {it.cost != null ? money(Math.round(it.cost)) : "—"}
                    </span>
                    <div className="flex items-center justify-end gap-1 font-mono">
                      <span className="text-muted">$</span>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={it.price ?? ""}
                        disabled={pending}
                        onChange={(e) => updatePrice(index, e.target.value)}
                        className="w-[70px] rounded-chip border border-border bg-ground px-2 py-1 text-right text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
                      />
                    </div>
                    <span className={`whitespace-nowrap text-right font-mono ${marginColorClass(marginPct)}`}>
                      {margin != null ? money(Math.round(margin)) : "—"}
                      {marginPct != null ? ` · ${marginPct.toFixed(0)}%` : ""}
                    </span>
                    <div className="text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => removeRow(index)}
                        aria-label="Remove item"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-chip text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {draft.length > 0 ? (
        <div className="rounded-card border border-border bg-surface p-6">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
            3. CREATE SHARE LINK
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                CLIENT NAME
              </span>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                INVOICE DATE
              </span>
              <input
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                placeholder="Optional"
                className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                NOTE TO CLIENT (OPTIONAL)
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                LINK EXPIRES IN
              </span>
              <select
                value={expiresHours}
                onChange={(e) => setExpiresHours(Number(e.target.value))}
                className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
              >
                {[1, 2, 4, 6, 8, 12].map((h) => (
                  <option key={h} value={h}>
                    {h} hour{h === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={createShare}
              className="h-11 rounded-chip bg-ink px-6 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create share link"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
      {pending ? <p className="text-[12.5px] text-muted">Creating link and opening the live view…</p> : null}

      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-[16px] font-semibold text-ink">Active links</h2>
          <span className="text-[12px] text-muted">{shares.length} live</span>
        </div>
        {listError ? <p className="mb-3 text-[12.5px] text-danger">{listError}</p> : null}
        {shares.length === 0 ? (
          <div className="rounded-chip border border-border px-4 py-6 text-center text-[12.5px] text-muted">
            No active curation links yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-chip border border-border">
            <div className="grid grid-cols-[1.2fr_80px_160px_160px_90px_44px] border-b border-border bg-ground px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              <span>Client</span>
              <span className="text-center">Items</span>
              <span>Decisions</span>
              <span>Created / expires</span>
              <span className="text-right"> </span>
              <span />
            </div>
            {shares.map((s) => {
              const counts = decisionCounts(s.items);
              return (
                <div
                  key={s.token}
                  className="grid grid-cols-[1.2fr_80px_160px_160px_90px_44px] items-center border-b border-border/60 px-4 py-3 text-[12.5px] text-[#3A3934] transition last:border-b-0 hover:bg-ground/70"
                >
                  <a
                    href={`/wholesaleportal/rep/curation/${s.token}`}
                    className="col-span-4 grid min-w-0 grid-cols-[1.2fr_80px_160px_160px] items-center"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">
                        {s.clientName || "Untitled link"}
                      </div>
                      {s.sessionEnded ? (
                        <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                          Session ended
                        </div>
                      ) : null}
                    </div>
                    <div className="text-center font-mono">{s.itemCount}</div>
                    <div className="font-mono text-[11px] text-secondary">
                      ✓{counts.approve} ~{counts.maybe} ✕{counts.decline} ·{counts.pending} pending
                    </div>
                    <div className="text-[11px] text-muted">
                      {fmtDateTime(s.createdAt)}
                      <br />
                      {s.sessionEnded ? "ended" : expiresLabel(s.expiresAt)}
                    </div>
                  </a>
                  <a
                    href={`/wholesaleportal/rep/curation/${s.token}`}
                    className="text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-accent"
                  >
                    Manage →
                  </a>
                  <div className="text-right">
                    <button
                      type="button"
                      disabled={revokingToken === s.token}
                      onClick={() => revokeShare(s.token, s.clientName)}
                      aria-label="Revoke link"
                      title="Revoke link"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-chip text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
