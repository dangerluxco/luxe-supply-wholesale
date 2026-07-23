"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PortalItemLine } from "@/components/PortalItemLine";
import { SimilarItemsCarousel, type SimilarItem } from "@/components/SimilarItemsLink";
import { money } from "@/lib/format";
import { formatMargin, marginFor, marginTone, marginToneClass } from "@/lib/pricing";

/** Staff-only pricing/stock facts for one SKU, resolved server-side. */
export type QuoteLineContext = {
  cost: number | null;
  compAvg: number | null;
  soldOut: boolean;
  /** Held by a different buyer (this request's own holds don't flag). */
  heldByOther: boolean;
  heldUntil: string | null;
};

type EditableItem = {
  sku: string;
  title: string;
  brand: string;
  quantity: number;
  price: number;
  imageUrl: string | null;
  isSuggestedLot: boolean;
  lotId: string;
  lotItems: Array<Record<string, unknown>>;
};

function resolveImageUrl(it: Record<string, unknown>): string | null {
  const direct = typeof it.imageUrl === "string" && it.imageUrl ? it.imageUrl : null;
  if (direct) return direct;
  if (it.isSuggestedLot && Array.isArray(it.lotItems)) {
    const first = (it.lotItems as Array<Record<string, unknown>>).find(
      (li) => typeof li.imageUrl === "string" && li.imageUrl,
    );
    return first ? String(first.imageUrl) : null;
  }
  return null;
}

function toEditable(raw: Array<Record<string, unknown>>): EditableItem[] {
  return raw.map((it) => {
    const rawLotItems = Array.isArray(it.lotItems)
      ? (it.lotItems as Array<Record<string, unknown>>)
      : [];
    const seen = new Set<string>();
    const lotItems: Array<Record<string, unknown>> = [];
    for (const li of rawLotItems) {
      const sku = String(li?.sku || "").trim();
      if (!sku) continue;
      const key = sku.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      lotItems.push({ ...li, sku });
    }
    return {
      sku: String(it.sku || ""),
      title: String(it.title || ""),
      brand: String(it.brand || ""),
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
      price: Number(it.price) || 0,
      imageUrl: resolveImageUrl(it),
      isSuggestedLot: !!it.isSuggestedLot,
      lotId: String(it.lotId || ""),
      lotItems,
    };
  });
}

/**
 * Line-item edits via API — no `"use server"` imports (soft-nav safe).
 */
export function QuoteItemsEditor({
  quoteId,
  items,
  context = {},
}: {
  quoteId: string;
  items: Array<Record<string, unknown>>;
  /** Keyed by UPPERCASE SKU. Absent keys render a plain row (no margin/stock line). */
  context?: Record<string, QuoteLineContext>;
}) {
  const initial = useMemo(() => toEditable(items), [items]);
  const router = useRouter();
  const [rows, setRows] = useState<EditableItem[]>(initial);
  const [savedRows, setSavedRows] = useState<EditableItem[]>(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(savedRows), [rows, savedRows]);
  const total = useMemo(() => rows.reduce((sum, r) => sum + r.price * r.quantity, 0), [rows]);

  function updatePrice(index: number, value: string) {
    const price = Number(value);
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, price: Number.isFinite(price) ? Math.max(0, price) : 0 } : r)),
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  // Adds a suggested item locally only — it becomes part of the normal unsaved
  // diff, same as a price edit, so staff review/adjust before "Save changes".
  function addSuggestedRow(item: SimilarItem) {
    setRows((prev) => [
      ...prev,
      {
        sku: item.sku,
        title: item.title || item.sku,
        brand: item.brand || "",
        quantity: 1,
        price: item.price ?? 0,
        imageUrl: item.imageUrl,
        isSuggestedLot: false,
        lotId: "",
        lotItems: [],
      },
    ]);
    setMessage(`${item.sku} added — remember to save changes.`);
  }

  const allKnownSkus = useMemo(
    () => rows.flatMap((r) => [r.sku, ...r.lotItems.map((li) => String(li?.sku || ""))]),
    [rows],
  );

  // Cost basis for a row — lot rows sum their members; null when any piece's
  // cost is unknown (a partial sum would show a fake margin).
  function rowCost(item: EditableItem): number | null {
    if (item.isSuggestedLot) {
      if (!item.lotItems.length) return null;
      let sum = 0;
      for (const li of item.lotItems) {
        const c = context[String(li?.sku || "").toUpperCase()]?.cost;
        if (c == null) return null;
        sum += c;
      }
      return sum;
    }
    return context[item.sku.toUpperCase()]?.cost ?? null;
  }

  function discardChanges() {
    setRows(savedRows);
    setError(null);
    setMessage(null);
  }

  function save() {
    setError(null);
    setMessage(null);
    start(async () => {
      const res = await fetch(`/api/staff/quotes/${quoteId}/items`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rows }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not update order request.");
        return;
      }
      setSavedRows(rows);
      setMessage(data.message || "Order request updated.");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div>
        <div className="rounded-chip border border-border px-4 py-6 text-center text-[12.5px] text-muted">
          No items remaining on this order request.
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={save}
            className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          {dirty && !pending ? (
            <button type="button" onClick={discardChanges} className="text-[11px] text-muted hover:text-ink">
              Discard changes
            </button>
          ) : null}
          {error ? <span className="text-[12px] text-danger">{error}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-chip border border-border">
        <div className="grid grid-cols-[1fr_100px_50px_110px_64px] border-b border-border bg-ground px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          <span>Item</span>
          <span>Brand</span>
          <span className="text-center">Qty</span>
          <span className="text-right">Price</span>
          <span />
        </div>
        {rows.map((item, i) => (
          <div
            key={`${item.sku}-${i}`}
            className="grid grid-cols-[1fr_100px_50px_110px_64px] items-center border-b border-border/60 px-4 py-3 text-[12.5px] last:border-b-0"
          >
            <div className="min-w-0">
              <PortalItemLine
                imageUrl={item.imageUrl}
                title={item.title}
                sku={item.isSuggestedLot ? undefined : item.sku}
                subtitle={
                  item.isSuggestedLot
                    ? `Suggested lot · ${item.lotItems.length} SKUs`
                    : undefined
                }
              />
            </div>
            <span className="text-secondary">{item.brand || "—"}</span>
            <span className="text-center font-mono">{item.quantity}</span>
            <div className="flex items-center justify-end gap-1 font-mono">
              <span className="text-muted">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={item.price}
                disabled={pending}
                onChange={(e) => updatePrice(i, e.target.value)}
                className="w-[74px] rounded-chip border border-border bg-surface px-2 py-1 text-right text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
              />
            </div>
            <div className="text-right">
              <button
                type="button"
                disabled={pending}
                onClick={() => removeRow(i)}
                className="text-[11px] text-muted hover:text-danger disabled:opacity-50"
              >
                Remove
              </button>
            </div>
            {(() => {
              const ctx = item.isSuggestedLot ? null : context[item.sku.toUpperCase()];
              const cost = rowCost(item);
              const margin = marginFor(
                cost != null ? cost * item.quantity : null,
                item.price * item.quantity,
              );
              const hasFacts = cost != null || ctx?.compAvg != null || ctx?.soldOut || ctx?.heldByOther;
              if (!hasFacts) return null;
              return (
                <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 font-mono text-[10.5px]">
                  {cost != null ? (
                    <>
                      <span className="text-muted">cost {money(Math.round(cost))}</span>
                      <span className={marginToneClass(marginTone(margin.percent))}>
                        margin {formatMargin(margin)}
                      </span>
                    </>
                  ) : null}
                  {ctx?.compAvg != null ? (
                    <span className="text-muted">comp avg {money(Math.round(ctx.compAvg))}</span>
                  ) : null}
                  {ctx?.soldOut ? (
                    <span className="rounded-chip border border-danger/40 bg-danger/5 px-1.5 py-0.5 font-semibold uppercase tracking-[0.08em] text-danger">
                      Sold
                    </span>
                  ) : ctx?.heldByOther ? (
                    <span className="rounded-chip border border-accent/50 bg-accent/10 px-1.5 py-0.5 font-semibold uppercase tracking-[0.08em] text-accent">
                      Held · another buyer
                    </span>
                  ) : null}
                </div>
              );
            })()}
            {!item.isSuggestedLot ? (
              <div className="col-span-full border-t border-border/60 pt-1">
                <SimilarItemsCarousel
                  sku={item.sku}
                  excludeSkus={allKnownSkus}
                  onAdd={addSuggestedRow}
                  addLabel="Add to order"
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[12.5px]">
        <span className="text-muted">
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
        {(() => {
          // Whole-request margin — only when every row's cost is known.
          let costSum = 0;
          let allKnown = rows.length > 0;
          for (const r of rows) {
            const c = rowCost(r);
            if (c == null) {
              allKnown = false;
              break;
            }
            costSum += c * r.quantity;
          }
          if (!allKnown) return null;
          const m = marginFor(costSum, total);
          return (
            <span className={`font-mono text-[11px] ${marginToneClass(marginTone(m.percent))}`}>
              margin {formatMargin(m)}
            </span>
          );
        })()}
        <span className="font-mono text-ink">{money(Math.round(total))}</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={save}
          className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {dirty && !pending ? (
          <button type="button" onClick={discardChanges} className="text-[11px] text-muted hover:text-ink">
            Discard changes
          </button>
        ) : null}
        {message ? <span className="text-[12px] text-[#4E9A6A]">{message}</span> : null}
        {error ? <span className="text-[12px] text-danger">{error}</span> : null}
      </div>
    </div>
  );
}
