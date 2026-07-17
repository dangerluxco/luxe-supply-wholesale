"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { money } from "@/lib/format";
import { portalDisplayTitle, portalShowSkuLine } from "@/components/PortalItemLine";
import { Placeholder } from "@/components/Placeholder";
import { TrashIcon } from "@/components/icons";
import { clsx } from "@/lib/clsx";

type Decision = "" | "approve" | "maybe" | "decline";

type CurationItem = {
  sku: string;
  title: string;
  brand: string;
  condition: string;
  cost: number | null;
  price: number;
  imageUrl: string | null;
  imageUrls: string[];
  decision: Decision;
  note: string;
  liveAdded?: boolean;
};

type CurationShare = {
  token: string;
  clientName: string;
  invoiceDate: string;
  note: string;
  items: CurationItem[];
  itemCount: number;
  heroSku: string | null;
  sessionEnded: boolean;
  revoked: boolean;
  revision: number;
  expiresAt: string | null;
  createdAt: string | null;
};

type ResolvedPreview = {
  sku: string;
  title: string;
  brand: string;
  condition: string;
  cost: number | null;
  imageUrl: string | null;
  imageUrls: string[];
};

const DECISION_META: Record<
  Exclude<Decision, "">,
  { label: string; activeClass: string; idleClass: string }
> = {
  approve: {
    label: "Approve",
    activeClass: "border-[#4E9A6A] bg-[#4E9A6A] text-white",
    idleClass: "border-border text-secondary hover:border-[#4E9A6A] hover:text-[#4E9A6A]",
  },
  maybe: {
    label: "Maybe",
    activeClass: "border-accent bg-accent text-ink",
    idleClass: "border-border text-secondary hover:border-accent hover:text-accent",
  },
  decline: {
    label: "Decline",
    activeClass: "border-danger bg-danger text-white",
    idleClass: "border-border text-secondary hover:border-danger hover:text-danger",
  },
};

function callStartedKey(token: string): string {
  return `curation-call-started:${token}`;
}

function formatElapsed(ms: number): string {
  if (!ms || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function computeStats(items: CurationItem[], callStartedAtMs: number | null, nowMs: number) {
  let approve = 0;
  let maybe = 0;
  let decline = 0;
  let pending = 0;
  let cart = 0;
  let costTotal = 0;
  for (const it of items) {
    if (it.decision === "approve") {
      approve += 1;
      cart += it.price;
      if (it.cost != null) costTotal += it.cost;
    } else if (it.decision === "maybe") maybe += 1;
    else if (it.decision === "decline") decline += 1;
    else pending += 1;
  }
  const elapsedMs = callStartedAtMs ? nowMs - callStartedAtMs : 0;
  const hours = elapsedMs > 0 ? elapsedMs / 3600000 : 0;
  const perHour = hours > 0 ? approve / hours : 0;
  const margin = cart - costTotal;
  const marginPct = cart > 0 ? (margin / cart) * 100 : null;
  return { approve, maybe, decline, pending, cart, rev: cart, pieces: approve, margin, marginPct, elapsedMs, perHour };
}

/** Margin color bands matching the marketing-site review table: green ≥18%, amber below, red if negative. */
function marginColorClass(percent: number | null): string {
  if (percent == null) return "text-secondary";
  if (percent < 0) return "text-danger";
  if (percent < 18) return "text-accent";
  return "text-[#4E9A6A]";
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

export function CurationManage({ initialShare, buyerUrl }: { initialShare: CurationShare; buyerUrl: string }) {
  const [share, setShare] = useState(initialShare);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const editingSku = useRef<Set<string>>(new Set());
  const metaEditing = useRef(false);

  // -- Call timer (Start call / elapsed / items-per-hour) --------------------
  const [callStartedAtMs, setCallStartedAtMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(callStartedKey(share.token));
      const ms = raw ? Number(raw) : NaN;
      if (Number.isFinite(ms) && ms > 0) setCallStartedAtMs(ms);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share.token]);

  useEffect(() => {
    if (!callStartedAtMs || share.sessionEnded) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [callStartedAtMs, share.sessionEnded]);

  function startCall() {
    const ms = Date.now();
    setCallStartedAtMs(ms);
    setNow(ms);
    try {
      sessionStorage.setItem(callStartedKey(share.token), String(ms));
    } catch {
      /* ignore */
    }
  }

  // -- Live poll ---------------------------------------------------------
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/staff/curation/${share.token}`, {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as { share?: CurationShare };
        if (data.share && data.share.revision >= share.revision) {
          setShare((prev) => ({
            ...data.share!,
            clientName: metaEditing.current ? prev.clientName : data.share!.clientName,
            invoiceDate: metaEditing.current ? prev.invoiceDate : data.share!.invoiceDate,
            items: data.share!.items.map((incoming) => {
              if (!editingSku.current.has(incoming.sku)) return incoming;
              const local = prev.items.find((it) => it.sku === incoming.sku);
              return local
                ? { ...incoming, price: local.price, decision: local.decision, note: local.note }
                : incoming;
            }),
          }));
        }
      } catch {
        /* ignore transient poll failures */
      }
    }, 2500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share.token]);

  const stats = computeStats(share.items, callStartedAtMs, now);

  function savePrice(sku: string, value: string) {
    const price = Number(value);
    setShare((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku === sku ? { ...it, price: Number.isFinite(price) ? price : it.price } : it)),
    }));
    editingSku.current.add(sku);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/price`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, price }),
      });
      editingSku.current.delete(sku);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not update price.");
      }
    });
  }

  function setItemDecision(sku: string, decision: Decision) {
    setShare((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku === sku ? { ...it, decision } : it)),
    }));
    editingSku.current.add(sku);
    fetch(`/api/curation/${share.token}/decision`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, decision }),
    })
      .catch(() => {})
      .finally(() => editingSku.current.delete(sku));
  }

  function toggleDecision(sku: string, decision: Exclude<Decision, "">) {
    const current = share.items.find((it) => it.sku === sku)?.decision;
    setItemDecision(sku, current === decision ? "" : decision);
  }

  function removeItem(sku: string) {
    if (!window.confirm(`Remove ${sku} from this curation link?`)) return;
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/remove-item`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not remove item.");
        return;
      }
      setShare((prev) => ({
        ...prev,
        items: prev.items.filter((it) => it.sku !== sku),
        itemCount: prev.itemCount - 1,
        heroSku: prev.heroSku === sku ? null : prev.heroSku,
      }));
    });
  }

  function saveNote(sku: string, note: string) {
    setShare((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku === sku ? { ...it, note } : it)),
    }));
    editingSku.current.add(sku);
    fetch(`/api/curation/${share.token}/note`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, note }),
    })
      .catch(() => {})
      .finally(() => editingSku.current.delete(sku));
  }

  // -- Live add (scan → preview → "Share to Live View") ----------------------
  const [addFolded, setAddFolded] = useState(false);
  const [addSku, setAddSku] = useState("");
  const [addPreview, setAddPreview] = useState<ResolvedPreview | null>(null);
  const [addPrice, setAddPrice] = useState("");
  const [addStatus, setAddStatus] = useState<string | null>(null);

  function lookupForAdd() {
    const sku = addSku.trim();
    if (!sku) return;
    setAddStatus(null);
    setError(null);
    if (share.items.some((it) => it.sku.toLowerCase() === sku.toLowerCase())) {
      setAddStatus("That SKU is already on this link — find it in the catalog below.");
      return;
    }
    start(async () => {
      const res = await fetch("/api/staff/curation/resolve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skusText: sku }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        items?: ResolvedPreview[];
        missing?: string[];
      };
      const resolved = data.items?.[0];
      if (!resolved || data.missing?.length) {
        setAddStatus(`SKU "${sku}" was not found in inventory.`);
        return;
      }
      setAddPreview(resolved);
      setAddPrice(
        resolved.cost != null && resolved.cost > 0 ? String(Math.round(resolved.cost / 0.8)) : "",
      );
    });
  }

  function shareToLiveView() {
    if (!addPreview) return;
    const price = Number(addPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a price above $0 before sharing to the live view.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/add-item`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: addPreview.sku,
          title: addPreview.title,
          brand: addPreview.brand,
          condition: addPreview.condition,
          cost: addPreview.cost,
          price,
          imageUrl: addPreview.imageUrl,
          imageUrls: addPreview.imageUrls,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not add item.");
        return;
      }
      setMessage(`${addPreview.sku} is now featured for the client.`);
      setAddSku("");
      setAddPreview(null);
      setAddPrice("");
      setAddStatus(null);
      setAddFolded(true);
    });
  }

  function clearAddPreview() {
    setAddSku("");
    setAddPreview(null);
    setAddPrice("");
    setAddStatus(null);
  }

  function endSession() {
    setError(null);
    if (stats.maybe > 0) {
      const reviewMaybes = window.confirm(
        `You still have ${stats.maybe} Maybe item${stats.maybe === 1 ? "" : "s"}.\n\n` +
          "OK = go back and review Maybes first\nCancel = continue ending the session",
      );
      if (reviewMaybes) {
        setMessage("Review Maybe items in the catalog below, then end the session when ready.");
        return;
      }
    } else if (stats.pending > 0) {
      if (
        !window.confirm(
          `You still have ${stats.pending} pending item${stats.pending === 1 ? "" : "s"} with no decision.\n\n` +
            "End session anyway and finalize current selections?",
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        "End this sales session?\n\n" +
          "• Selections will be finalized (buyer catalog becomes read-only)\n" +
          "• Live add stops; the featured item is cleared\n" +
          "• Link stays available until expiry (or revoke)\n" +
          "• You can export the final CSV afterward",
      )
    ) {
      return;
    }

    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/end`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not end session.");
        return;
      }
      setShare((prev) => ({ ...prev, sessionEnded: true, heroSku: null }));
      try {
        sessionStorage.removeItem(callStartedKey(share.token));
      } catch {
        /* ignore */
      }
      setMessage("Session ended — the link is now read-only for the client.");
      if (window.confirm("Session ended. Download the final decisions CSV now?")) {
        window.location.href = `/api/staff/curation/${share.token}/export`;
      }
    });
  }

  function saveMeta(patch: { clientName?: string; invoiceDate?: string }) {
    setShare((prev) => ({ ...prev, ...patch }));
    metaEditing.current = true;
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/meta`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      metaEditing.current = false;
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not update details.");
      }
    });
  }

  function revoke() {
    if (!window.confirm("Revoke this link? The client will immediately lose access.")) return;
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/revoke`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not revoke link.");
        return;
      }
      setShare((prev) => ({ ...prev, revoked: true }));
      setMessage("Link revoked.");
    });
  }

  const marginLabel =
    stats.marginPct != null
      ? `${money(Math.round(stats.margin))} · ${stats.marginPct.toFixed(0)}%`
      : money(Math.round(stats.margin));

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={buyerUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 min-w-[260px] flex-1 rounded-chip border border-border bg-ground px-3 font-mono text-[12px] text-ink"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(buyerUrl).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="h-10 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={buyerUrl}
            target="_blank"
            rel="noreferrer"
            className="h-10 rounded-chip bg-ink px-3 text-[11px] font-semibold uppercase tracking-[0.1em] leading-10 text-ground"
          >
            Open
          </a>
          <a
            href={`/api/staff/curation/${share.token}/export`}
            className="h-10 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] leading-10 text-secondary hover:border-accent hover:text-ink"
          >
            Export CSV
          </a>
          {!share.revoked ? (
            <button
              type="button"
              disabled={pending}
              onClick={revoke}
              className="h-10 rounded-chip border border-danger/40 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-danger hover:bg-danger/5 disabled:opacity-60"
            >
              Revoke
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[12.5px]">
          <span
            className={
              share.revoked
                ? "font-semibold uppercase tracking-[0.08em] text-danger"
                : share.sessionEnded
                  ? "font-semibold uppercase tracking-[0.08em] text-muted"
                  : "font-semibold uppercase tracking-[0.08em] text-[#4E9A6A]"
            }
          >
            {share.revoked ? "Revoked" : share.sessionEnded ? "Session ended" : "Live"}
          </span>
          {!share.revoked ? (
            <span className="text-muted">{expiresLabel(share.expiresAt)}</span>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12.5px] text-[#4E9A6A]">{message}</p> : null}

      {/* 4. Live add (on the call) */}
      {!share.revoked ? (
        <div className="rounded-card border border-accent/30 bg-surface p-6">
          <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
            LIVE — ON THE CALL
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                CLIENT NAME
              </span>
              <input
                defaultValue={share.clientName}
                disabled={share.sessionEnded}
                onBlur={(e) => saveMeta({ clientName: e.target.value })}
                className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                INVOICE DATE
              </span>
              <input
                defaultValue={share.invoiceDate}
                disabled={share.sessionEnded}
                onBlur={(e) => saveMeta({ invoiceDate: e.target.value })}
                placeholder="Optional"
                className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
              />
            </label>
          </div>

          {share.sessionEnded ? (
            <div className="rounded-chip border border-border bg-ground px-4 py-4">
              <p className="text-[13px] font-semibold text-ink">
                Sales session ended — selections are finalized.
              </p>
              <p className="mt-1 font-mono text-[11.5px] text-secondary">
                ✓{stats.approve} approved · ~{stats.maybe} maybe · ✕{stats.decline} declined ·{" "}
                {stats.pending} pending · {money(Math.round(stats.cart))} cart
              </p>
              <a
                href={`/api/staff/curation/${share.token}/export`}
                className="mt-3 inline-block h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] leading-9 text-ground"
              >
                Export final CSV
              </a>
            </div>
          ) : !callStartedAtMs ? (
            <div>
              <p className="text-[12.5px] text-secondary">
                Your catalog link is ready — send it anytime. When you and the client are on the
                call together, start the timer and switch to the live view.
              </p>
              <button
                type="button"
                onClick={startCall}
                className="mt-3 h-10 rounded-chip bg-ink px-5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ground"
              >
                Start call
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12px] text-secondary">
                  When you&apos;re done deciding items, end the session to finalize selections.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={endSession}
                  className="h-9 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink disabled:opacity-60"
                >
                  End sales session
                </button>
              </div>

              <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {[
                  { label: "Time elapsed", value: formatElapsed(stats.elapsedMs) },
                  { label: "Piece count", value: String(stats.pieces) },
                  { label: "Items/hour", value: stats.perHour ? stats.perHour.toFixed(1) : "0" },
                  { label: "Total rev", value: money(Math.round(stats.rev)) },
                  { label: "Net margin", value: marginLabel },
                  { label: "Approve", value: String(stats.approve) },
                  { label: "Maybe", value: String(stats.maybe) },
                  { label: "Decline", value: String(stats.decline) },
                  { label: "Pending", value: String(stats.pending) },
                  { label: "Cart (approved)", value: money(Math.round(stats.cart)) },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-chip border border-border bg-ground px-3 py-2.5 text-center"
                  >
                    <div className="font-mono text-[15px] text-ink">{s.value}</div>
                    <div className="mt-0.5 text-[9.5px] uppercase tracking-[0.08em] text-muted">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {addFolded && !addPreview ? (
                <button
                  type="button"
                  onClick={() => setAddFolded(false)}
                  className="h-9 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink"
                >
                  Add another item
                </button>
              ) : (
                <div className="rounded-chip border border-border bg-ground p-4">
                  <p className="text-[11.5px] text-muted">
                    Scan or type a SKU, set the listing price, then share it — the client sees it
                    featured immediately.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={addSku}
                      onChange={(e) => setAddSku(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          lookupForAdd();
                        }
                      }}
                      placeholder="Scan or type SKU, then Enter"
                      className="h-10 flex-1 rounded-chip border border-border bg-surface px-3 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      disabled={pending || !addSku.trim()}
                      onClick={lookupForAdd}
                      className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
                    >
                      Look up
                    </button>
                  </div>
                  {addStatus ? <p className="mt-2 text-[11.5px] text-danger">{addStatus}</p> : null}

                  {addPreview ? (
                    <div className="mt-3 flex gap-3 rounded-chip border border-border bg-surface p-3">
                      <Placeholder
                        imageSrc={addPreview.imageUrl}
                        alt={portalDisplayTitle(addPreview.title, addPreview.sku)}
                        className="h-16 w-16 shrink-0 rounded-chip"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] text-ink">
                          {portalDisplayTitle(addPreview.title, addPreview.sku)}
                        </div>
                        <div className="font-mono text-[11px] text-muted">{addPreview.sku}</div>
                        <div className="text-[11px] text-secondary">
                          Cost:{" "}
                          <strong className="text-ink">
                            {addPreview.cost != null ? money(Math.round(addPreview.cost)) : "—"}
                          </strong>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <label className="flex items-center gap-1.5 font-mono text-[12px]">
                            <span className="text-muted">$</span>
                            <input
                              type="number"
                              min={0}
                              value={addPrice}
                              onChange={(e) => setAddPrice(e.target.value)}
                              className="w-[80px] rounded-chip border border-border bg-ground px-2 py-1 text-ink outline-none focus:border-accent"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={shareToLiveView}
                            className="h-9 rounded-chip bg-ink px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ground disabled:opacity-60"
                          >
                            Share to Live View
                          </button>
                          <button
                            type="button"
                            onClick={clearAddPreview}
                            className="text-[11px] text-muted hover:text-ink"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-chip border border-border">
        <div className="grid grid-cols-[112px_minmax(160px,1fr)_80px_90px_100px_190px_minmax(120px,1fr)_40px] items-center gap-x-3 border-b border-border bg-ground px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          <span />
          <span>Item</span>
          <span className="text-right">Cost</span>
          <span className="text-right">Price</span>
          <span className="text-right">Margin</span>
          <span className="text-center">Decision</span>
          <span>Client note</span>
          <span />
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {share.items.map((it) => {
            const margin = it.cost != null ? it.price - it.cost : null;
            const marginPct = margin != null && it.price > 0 ? (margin / it.price) * 100 : null;
            return (
              <div
                key={it.sku}
                className={clsx(
                  "grid grid-cols-[112px_minmax(160px,1fr)_80px_90px_100px_190px_minmax(120px,1fr)_40px] items-center gap-x-3 border-b border-border/60 px-3 py-2.5 text-[12.5px] last:border-b-0",
                  share.heroSku === it.sku && "bg-accent/5",
                )}
              >
                <Placeholder
                  imageSrc={it.imageUrl}
                  alt={portalDisplayTitle(it.title, it.sku)}
                  className="h-24 w-24 shrink-0 rounded-chip"
                />
                <div className="min-w-0 px-2">
                  <div className="truncate text-ink">
                    {portalDisplayTitle(it.title, it.sku)}
                    {share.heroSku === it.sku ? (
                      <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em] text-accent">
                        now viewing
                      </span>
                    ) : null}
                  </div>
                  {portalShowSkuLine(it.title, it.sku) ? (
                    <div className="truncate font-mono text-[11px] text-muted">{it.sku}</div>
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
                    disabled={pending || share.sessionEnded || share.revoked}
                    defaultValue={it.price}
                    onBlur={(e) => savePrice(it.sku, e.target.value)}
                    className="w-[70px] rounded-chip border border-border bg-ground px-2 py-1 text-right text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
                  />
                </div>
                <span className={`whitespace-nowrap text-right font-mono ${marginColorClass(marginPct)}`}>
                  {margin != null ? money(Math.round(margin)) : "—"}
                  {marginPct != null ? ` · ${marginPct.toFixed(0)}%` : ""}
                </span>
                <div className="flex justify-center gap-1">
                  {(["approve", "maybe", "decline"] as const).map((d) => {
                    const meta = DECISION_META[d];
                    const active = it.decision === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={share.sessionEnded || share.revoked}
                        onClick={() => toggleDecision(it.sku, d)}
                        className={clsx(
                          "h-7 rounded-chip border px-2 text-[10px] font-semibold uppercase tracking-[0.06em] transition disabled:opacity-50",
                          active ? meta.activeClass : meta.idleClass,
                        )}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  defaultValue={it.note}
                  disabled={share.sessionEnded || share.revoked}
                  onBlur={(e) => saveNote(it.sku, e.target.value)}
                  placeholder="—"
                  className="h-8 min-w-0 rounded-chip border border-border bg-ground px-2 text-[11.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
                />
                <div className="text-right">
                  <button
                    type="button"
                    disabled={pending || share.sessionEnded || share.revoked}
                    onClick={() => removeItem(it.sku)}
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
  );
}
