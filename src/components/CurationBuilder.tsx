"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { portalDisplayTitle, portalShowSkuLine } from "@/components/PortalItemLine";
import { Placeholder } from "@/components/Placeholder";
import { TrashIcon } from "@/components/icons";

/**
 * Staff curation-share builder — fetch APIs only (no `"use server"`, soft-nav safe).
 * Choose client → paste SKUs → resolve against inventory → price/review → create a
 * shareable, time-limited link for a buyer to approve/decline items on their own.
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

type BuyerOption = {
  id: string;
  displayName: string;
  username: string;
  email: string;
  company: string;
};

const POTENTIAL_VALUE = "__potential__";

function buyerLabel(b: BuyerOption): string {
  const name = b.displayName || b.username || b.email || "Client";
  const meta = [b.username ? `@${b.username}` : "", b.company].filter(Boolean).join(" · ");
  return meta ? `${name} (${meta})` : name;
}

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

export function CurationBuilder({
  initialShares,
  initialBuyerId,
}: {
  initialShares: ActiveShare[];
  /** Prefill client dropdown when this buyer id is present in the loaded list. */
  initialBuyerId?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [skusText, setSkusText] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [buyers, setBuyers] = useState<BuyerOption[]>([]);
  const [buyersLoading, setBuyersLoading] = useState(true);
  const [buyersError, setBuyersError] = useState<string | null>(null);
  /** Empty = not chosen; buyer id; or POTENTIAL_VALUE */
  const [clientSelect, setClientSelect] = useState("");
  const [potentialName, setPotentialName] = useState("");
  // Defaults to today; the native date input gives the click-to-pick calendar.
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [expiresHours, setExpiresHours] = useState(4);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shares, setShares] = useState(initialShares);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  /** Order request created from this builder session — refresh items instead of duplicating. */
  const [sessionQuoteId, setSessionQuoteId] = useState<string | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const wanted = String(initialBuyerId || "").trim();
    setBuyersLoading(true);
    setBuyersError(null);
    fetch("/api/staff/buyers/search?all=1", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { buyers?: BuyerOption[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) {
          setBuyersError(data.error);
          setBuyers([]);
          return;
        }
        const list = data.buyers || [];
        setBuyers(list);
        // Only preselect when the id is a real option; invalid ids leave the empty select.
        if (wanted && list.some((b) => b.id === wanted)) {
          setClientSelect(wanted);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBuyersError("Could not load clients.");
          setBuyers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setBuyersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialBuyerId]);

  const selectedBuyer = useMemo(
    () => (clientSelect && clientSelect !== POTENTIAL_VALUE ? buyers.find((b) => b.id === clientSelect) : null),
    [buyers, clientSelect],
  );

  const clientReady =
    (clientSelect === POTENTIAL_VALUE && potentialName.trim().length > 0) ||
    (!!selectedBuyer && clientSelect !== POTENTIAL_VALUE);

  const clientSummary = useMemo(() => {
    if (clientSelect === POTENTIAL_VALUE && potentialName.trim()) {
      return `${potentialName.trim()} (potential)`;
    }
    if (selectedBuyer) return buyerLabel(selectedBuyer);
    return "";
  }, [clientSelect, potentialName, selectedBuyer]);

  const total = useMemo(
    () => draft.reduce((sum, it) => sum + (it.price || 0), 0),
    [draft],
  );

  function resolveSkus() {
    setError(null);
    if (!clientReady) {
      setError("Choose a client before looking up SKUs.");
      return;
    }
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
    setClientSelect("");
    setPotentialName("");
    setInvoiceDate("");
    setNote("");
    setExpiresHours(4);
    setError(null);
    setSessionQuoteId(null);
  }

  const isPotentialClient = clientSelect === POTENTIAL_VALUE;
  const linkedBuyerId = isPotentialClient ? null : clientSelect || null;
  const canCreateOrderRequest =
    !!linkedBuyerId && draft.length > 0 && draft.every((it) => it.price != null && it.price > 0);

  function createOrderRequest() {
    setError(null);
    if (!linkedBuyerId) {
      setError("Select an existing portal client to create an order request (potential clients can’t be saved as orders yet).");
      return;
    }
    if (!draft.length) {
      setError("Add at least one item before creating an order request.");
      return;
    }
    const unpriced = draft.filter((it) => it.price == null || !(it.price > 0));
    if (unpriced.length) {
      setError(`${unpriced.length} item${unpriced.length === 1 ? "" : "s"} need a price above $0.`);
      return;
    }

    setOrderBusy(true);
    start(async () => {
      try {
        const res = await fetch("/api/staff/quotes", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyerId: linkedBuyerId,
            quoteId: sessionQuoteId || undefined,
            items: draft.map((it) => ({
              sku: it.sku,
              title: it.title,
              brand: it.brand,
              quantity: 1,
              price: it.price,
              imageUrl: it.imageUrl,
            })),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          quoteId?: string;
          quoteUrl?: string;
        };
        if (!res.ok || data.error || !data.quoteId) {
          setError(data.error || "Could not create the order request.");
          return;
        }
        setSessionQuoteId(data.quoteId);
        // Always navigate relative — data.quoteUrl is an absolute STAFF_ORIGIN link
        // meant for emails, and a misconfigured origin would leave the app.
        router.push(`/wholesaleportal/rep/quotes/${data.quoteId}`);
      } finally {
        setOrderBusy(false);
      }
    });
  }

  function createShare() {
    setError(null);
    if (!clientReady) {
      setError("Choose an existing client or enter a potential client name.");
      return;
    }
    if (!draft.length) {
      setError("Add at least one item before creating a link.");
      return;
    }
    const unpriced = draft.filter((it) => it.price == null || !(it.price > 0));
    if (unpriced.length) {
      setError(`${unpriced.length} item${unpriced.length === 1 ? "" : "s"} need a price above $0.`);
      return;
    }
    const clientName =
      isPotentialClient
        ? potentialName.trim()
        : selectedBuyer?.displayName || selectedBuyer?.username || selectedBuyer?.email || "";

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
          linkedBuyerId,
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
      router.push(`/wholesaleportal/rep/curation/${data.share.token}`);
    });
  }

  async function revokeShare(token: string, label: string) {
    if (!window.confirm(`Revoke the link for “${label || "this client"}”? They won’t be able to open it.`)) {
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
          1. CHOOSE CLIENT
        </div>
        <p className="mt-1 text-[12.5px] text-secondary">
          Pick an existing portal client, or choose Potential client to enter someone who
          isn&apos;t registered yet.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">CLIENT</span>
            <select
              value={clientSelect}
              disabled={buyersLoading}
              onChange={(e) => {
                setClientSelect(e.target.value);
                if (e.target.value !== POTENTIAL_VALUE) setPotentialName("");
                setSessionQuoteId(null);
                setError(null);
              }}
              className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
            >
              <option value="">
                {buyersLoading ? "Loading clients…" : "Select a client…"}
              </option>
              {buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {buyerLabel(b)}
                </option>
              ))}
              <option value={POTENTIAL_VALUE}>Potential client…</option>
            </select>
          </label>
          {clientSelect === POTENTIAL_VALUE ? (
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                POTENTIAL CLIENT NAME
              </span>
              <input
                value={potentialName}
                onChange={(e) => {
                  setPotentialName(e.target.value);
                  setError(null);
                }}
                placeholder="Name of someone not yet in the portal"
                className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
              />
            </label>
          ) : null}
        </div>
        {buyersError ? <p className="mt-2 text-[12.5px] text-danger">{buyersError}</p> : null}
        {!buyersLoading && !buyersError && buyers.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            No portal clients yet — use Potential client, or register a buyer first.
          </p>
        ) : null}
        {clientReady ? (
          <p className="mt-3 text-[12.5px] text-[#4E9A6A]">Curating for {clientSummary}</p>
        ) : null}
      </div>

      <div
        className={`rounded-card border border-border bg-surface p-6 ${
          clientReady ? "" : "opacity-55"
        }`}
      >
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
          2. PASTE SKUS
        </div>
        <p className="mt-1 text-[12.5px] text-secondary">
          {clientReady
            ? "Paste SKUs one per line — or two spreadsheet columns (SKU + price) straight from Excel, same as the catalog import. Up to 200 at a time."
            : "Choose a client above first, then paste SKUs here."}
        </p>
        <textarea
          value={skusText}
          onChange={(e) => setSkusText(e.target.value)}
          rows={4}
          disabled={!clientReady}
          placeholder="SKU-001&#9;1250&#10;SKU-002&#9;980&#10;SKU-003"
          className="mt-3 w-full rounded-chip border border-border bg-ground px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !clientReady || !skusText.trim()}
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
              3. REVIEW &amp; PRICE — {draft.length} ITEM{draft.length === 1 ? "" : "S"}
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

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <button
              type="button"
              disabled={pending || orderBusy || !canCreateOrderRequest}
              onClick={createOrderRequest}
              title={
                isPotentialClient
                  ? "Select an existing portal client — potential clients can’t become order requests yet."
                  : !draft.every((it) => it.price != null && it.price > 0)
                    ? "Price every item above $0 first."
                    : sessionQuoteId
                      ? "Update this session’s order request and open it."
                      : "Save this list as an order request for the selected client."
              }
              className="h-11 rounded-chip bg-accent px-6 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink disabled:opacity-60"
            >
              {orderBusy
                ? sessionQuoteId
                  ? "Updating…"
                  : "Creating…"
                : sessionQuoteId
                  ? "Update order request"
                  : "Create order request"}
            </button>
            {isPotentialClient ? (
              <span className="text-[12px] text-muted">
                Order requests need an existing portal client — share links still work for potential clients.
              </span>
            ) : !canCreateOrderRequest ? (
              <span className="text-[12px] text-muted">Price every item above $0 to save as an order request.</span>
            ) : (
              <span className="text-[12px] text-secondary">
                Saves to Order Requests for {clientSummary}
                {sessionQuoteId ? " (updates this session’s request)." : "."}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {draft.length > 0 ? (
        <div className="rounded-card border border-border bg-surface p-6">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
            4. CREATE SHARE LINK
          </div>
          <p className="mt-1 text-[12.5px] text-secondary">
            Link will be for <span className="text-ink">{clientSummary}</span>
            {clientSelect === POTENTIAL_VALUE
              ? " — they are not linked to a portal account yet."
              : " — linked to their portal account."}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                INVOICE DATE
              </span>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
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
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending || !clientReady}
              onClick={createShare}
              className="h-11 rounded-chip bg-ink px-6 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create share link"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
      {orderBusy ? (
        <p className="text-[12.5px] text-muted">
          {sessionQuoteId ? "Updating order request…" : "Creating order request…"}
        </p>
      ) : null}

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
            <div className="grid grid-cols-[minmax(120px,1.4fr)_90px_110px_100px_88px] items-center gap-x-3 border-b border-border bg-ground px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              <span>Client</span>
              <span>Items</span>
              <span>Created</span>
              <span>Expires</span>
              <span />
            </div>
            {shares.map((s) => {
              const counts = decisionCounts(s.items);
              return (
                <div
                  key={s.token}
                  className="grid grid-cols-[minmax(120px,1.4fr)_90px_110px_100px_88px] items-center gap-x-3 border-b border-border/60 px-3 py-3 text-[12.5px] last:border-b-0"
                >
                  <div className="min-w-0">
                    <a
                      href={`/wholesaleportal/rep/curation/${s.token}`}
                      className="truncate font-medium text-ink underline-offset-2 hover:underline"
                    >
                      {s.clientName || "Untitled link"}
                    </a>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {counts.approve} yes · {counts.maybe} maybe · {counts.decline} no
                      {counts.pending > 0 ? ` · ${counts.pending} pending` : ""}
                    </div>
                  </div>
                  <span className="font-mono text-secondary">{s.itemCount}</span>
                  <span className="text-[11.5px] text-muted">{fmtDateTime(s.createdAt)}</span>
                  <span className="text-[11.5px] text-muted">{expiresLabel(s.expiresAt)}</span>
                  <div className="text-right">
                    <button
                      type="button"
                      disabled={revokingToken === s.token}
                      onClick={() => revokeShare(s.token, s.clientName)}
                      className="text-[11px] uppercase tracking-[0.08em] text-muted hover:text-danger disabled:opacity-50"
                    >
                      {revokingToken === s.token ? "…" : "Revoke"}
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
