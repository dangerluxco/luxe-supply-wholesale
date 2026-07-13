"use client";

import { useMemo, useState, useTransition } from "react";
import { Placeholder } from "@/components/Placeholder";
import { saveQuoteLineItems } from "@/lib/actions/portal";
import { money } from "@/lib/format";

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
  return raw.map((it) => ({
    sku: String(it.sku || ""),
    title: String(it.title || ""),
    brand: String(it.brand || ""),
    quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
    price: Number(it.price) || 0,
    imageUrl: resolveImageUrl(it),
    isSuggestedLot: !!it.isSuggestedLot,
    lotId: String(it.lotId || ""),
    lotItems: Array.isArray(it.lotItems) ? (it.lotItems as Array<Record<string, unknown>>) : [],
  }));
}

export function QuoteItemsEditor({
  quoteId,
  items,
}: {
  quoteId: string;
  items: Array<Record<string, unknown>>;
}) {
  const initial = useMemo(() => toEditable(items), [items]);
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

  function discardChanges() {
    setRows(savedRows);
    setError(null);
    setMessage(null);
  }

  function save() {
    setError(null);
    setMessage(null);
    start(async () => {
      const res = await saveQuoteLineItems(quoteId, rows);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSavedRows(rows);
      setMessage(res?.message || "Invoice request updated.");
    });
  }

  if (rows.length === 0) {
    return (
      <div>
        <div className="rounded-chip border border-border px-4 py-6 text-center text-[12.5px] text-muted">
          No items remaining on this invoice request.
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
            <div className="flex min-w-0 items-center gap-3">
              <Placeholder imageSrc={item.imageUrl} className="h-10 w-10 shrink-0 rounded-chip" />
              <div className="min-w-0">
                <div className="truncate text-ink">{item.title || "—"}</div>
                <div className="font-mono text-[11px] text-muted">
                  {item.isSuggestedLot
                    ? `Suggested lot · ${item.lotItems.length} SKUs`
                    : item.sku || "—"}
                </div>
              </div>
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
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[12.5px]">
        <span className="text-muted">
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
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
