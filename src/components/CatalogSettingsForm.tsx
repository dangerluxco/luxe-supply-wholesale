"use client";

import { useMemo, useState, useTransition } from "react";
import {
  buildCuratedCatalogDraft,
  saveCuratedCatalogAction,
  setCatalogModeAction,
} from "@/lib/actions/catalog-settings";
import { money } from "@/lib/format";
import { Placeholder } from "@/components/Placeholder";

type CuratedCatalogItem = {
  sku: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  inDb: boolean;
  cost: number | null;
  price: number | null;
  priceOverridden: boolean;
};

type CuratedCatalog = {
  items: CuratedCatalogItem[];
  unresolvedSkus: string[];
  updatedAt: string | null;
  updatedBy: string;
};

function fmtDate(iso: string | null): string {
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

export function CatalogSettingsForm({
  mode,
  curatedCatalog,
}: {
  mode: string;
  curatedCatalog: CuratedCatalog | null;
}) {
  const [savedMode, setSavedMode] = useState(mode === "sku_list" ? "sku_list" : "all");
  const [selectedMode, setSelectedMode] = useState(savedMode);
  const [curated, setCurated] = useState<CuratedCatalog | null>(curatedCatalog);
  const [skusText, setSkusText] = useState(
    (curatedCatalog?.items || []).map((i) => i.sku).join("\n"),
  );
  const [draft, setDraft] = useState<{ items: CuratedCatalogItem[] } | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draftUnresolvedCount = useMemo(
    () => (draft ? draft.items.filter((i) => !i.inDb).length : 0),
    [draft],
  );
  const draftTotal = useMemo(
    () => (draft ? draft.items.reduce((sum, i) => sum + (i.price || 0), 0) : 0),
    [draft],
  );

  function saveMode() {
    setError(null);
    setMessage(null);
    start(async () => {
      const res = await setCatalogModeAction(selectedMode);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSavedMode(selectedMode);
      setMessage(res?.message || "Mode saved.");
    });
  }

  function buildDraft() {
    setError(null);
    setMessage(null);
    start(async () => {
      const res = await buildCuratedCatalogDraft(skusText);
      if (!res || "error" in res) {
        setError(res?.error || "Could not resolve SKUs.");
        return;
      }
      setDraft({ items: res.items });
    });
  }

  function updateDraftPrice(index: number, value: string) {
    const price = Number(value);
    setDraft((prev) =>
      prev
        ? {
            items: prev.items.map((it, i) =>
              i === index
                ? { ...it, price: Number.isFinite(price) ? Math.max(0, price) : null, priceOverridden: true }
                : it,
            ),
          }
        : prev,
    );
  }

  function removeDraftRow(index: number) {
    setDraft((prev) => (prev ? { items: prev.items.filter((_, i) => i !== index) } : prev));
  }

  function discardDraft() {
    setDraft(null);
    setError(null);
    setMessage(null);
  }

  function saveCatalog() {
    if (!draft) return;
    setError(null);
    setMessage(null);
    const unresolvedSkus = draft.items.filter((i) => !i.inDb).map((i) => i.sku);
    start(async () => {
      const res = await saveCuratedCatalogAction(draft.items, unresolvedSkus);
      if (res?.error) {
        setError(res.error);
        return;
      }
      const now = new Date().toISOString();
      setCurated({ items: draft.items, unresolvedSkus, updatedAt: now, updatedBy: "you" });
      setSkusText(draft.items.map((i) => i.sku).join("\n"));
      setDraft(null);
      setSavedMode("sku_list");
      setSelectedMode("sku_list");
      setMessage(res?.message || "Curated catalog saved.");
    });
  }

  return (
    <div className="mt-6 max-w-4xl space-y-4 rounded-card border border-border bg-surface p-6">
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">CATALOG SELECTION</div>
      <p className="text-[12.5px] text-secondary">
        Controls which SKUs appear on the buyer storefront, and at what price.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
        <label className="flex items-center gap-2 text-[12.5px]">
          <input
            type="radio"
            name="mode"
            value="all"
            checked={selectedMode === "all"}
            onChange={() => setSelectedMode("all")}
          />
          All catalog products (testing)
        </label>
        <label className="flex items-center gap-2 text-[12.5px]">
          <input
            type="radio"
            name="mode"
            value="sku_list"
            checked={selectedMode === "sku_list"}
            onChange={() => setSelectedMode("sku_list")}
          />
          Curated / SKU allowlist (live catalog)
        </label>
        <button
          type="button"
          disabled={pending || selectedMode === savedMode}
          onClick={saveMode}
          className="h-9 rounded-chip border border-border bg-ground px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink disabled:opacity-50"
        >
          {pending ? "Saving…" : "Use this mode"}
        </button>
        <span className="text-[11px] text-muted">
          Live: {savedMode === "sku_list" ? "Curated catalog" : "All products"}
        </span>
      </div>

      {selectedMode === "sku_list" ? (
        <div className="space-y-4 border-t border-border pt-4">
          {curated && curated.items.length ? (
            <div className="rounded-chip border border-border bg-ground p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                  CURRENT SAVED CATALOG
                </span>
                <span className="text-[11px] text-muted">
                  {curated.items.length} item{curated.items.length === 1 ? "" : "s"}
                  {curated.unresolvedSkus.length
                    ? ` · ${curated.unresolvedSkus.length} unresolved`
                    : ""}
                  {" · updated "}
                  {fmtDate(curated.updatedAt)}
                  {curated.updatedBy ? ` by ${curated.updatedBy}` : ""}
                </span>
              </div>
              <div className="mt-3 max-h-48 overflow-y-auto">
                {curated.items.slice(0, 12).map((it, index) => (
                  <div
                    key={`${it.sku}-${index}`}
                    className="flex items-center justify-between border-b border-border/60 py-1.5 text-[12px] last:border-b-0"
                  >
                    <span className="font-mono text-[11px] text-secondary">{it.sku}</span>
                    <span className="truncate px-3 text-ink">{it.title}</span>
                    <span className="font-mono text-ink">
                      {it.price != null ? money(it.price) : "—"}
                    </span>
                  </div>
                ))}
                {curated.items.length > 12 ? (
                  <div className="pt-1.5 text-[11px] text-muted">
                    +{curated.items.length - 12} more…
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-muted">
              No curated catalog saved yet — paste SKUs below to build one.
            </p>
          )}

          {!draft ? (
            <div className="space-y-2">
              <label className="flex flex-col gap-1.5">
                <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                  PASTE SKUS TO BUILD / REPLACE THE CATALOG (ONE PER LINE OR COMMA-SEPARATED)
                </span>
                <textarea
                  value={skusText}
                  onChange={(e) => setSkusText(e.target.value)}
                  rows={8}
                  className="rounded-chip border border-border bg-ground px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
                />
              </label>
              <button
                type="button"
                disabled={pending || !skusText.trim()}
                onClick={buildDraft}
                className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
              >
                {pending ? "Resolving…" : "Build draft"}
              </button>
              <p className="text-[11px] text-muted">
                Saving a draft overwrites the previously saved curated catalog entirely.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                  REVIEW DRAFT — {draft.items.length} ITEM{draft.items.length === 1 ? "" : "S"}
                </span>
                <span className="font-mono text-[12px] text-ink">{money(Math.round(draftTotal))} total</span>
              </div>

              {draftUnresolvedCount > 0 ? (
                <div className="rounded-chip border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
                  {draftUnresolvedCount} SKU{draftUnresolvedCount === 1 ? "" : "s"} not found in
                  inventory — remove or fix below before saving.
                </div>
              ) : null}

              <div className="overflow-hidden rounded-chip border border-border">
                <div className="grid grid-cols-[40px_1fr_90px_60px_110px_56px] items-center border-b border-border bg-ground px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  <span />
                  <span>Item</span>
                  <span className="text-right">Cost</span>
                  <span className="text-center">In DB</span>
                  <span className="text-right">Price</span>
                  <span />
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  {draft.items.map((item, i) => (
                    <div
                      key={`${item.sku}-${i}`}
                      className="grid grid-cols-[40px_1fr_90px_60px_110px_56px] items-center border-b border-border/60 px-3 py-2.5 text-[12.5px] last:border-b-0"
                    >
                      <Placeholder imageSrc={item.imageUrl} className="h-8 w-8 shrink-0 rounded-[4px]" />
                      <div className="min-w-0 px-2">
                        <div className="truncate text-ink">{item.title || item.sku}</div>
                        <div className="font-mono text-[11px] text-muted">
                          {item.sku}
                          {item.brand ? ` · ${item.brand}` : ""}
                        </div>
                      </div>
                      <span className="text-right font-mono text-secondary">
                        {item.cost != null ? money(Math.round(item.cost)) : "missing"}
                      </span>
                      <span
                        className={
                          "text-center text-[11px] font-semibold " +
                          (item.inDb ? "text-[#4E9A6A]" : "text-danger")
                        }
                      >
                        {item.inDb ? "Yes" : "No"}
                      </span>
                      <div className="flex items-center justify-end gap-1 font-mono">
                        <span className="text-muted">$</span>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={item.price ?? ""}
                          disabled={pending}
                          onChange={(e) => updateDraftPrice(i, e.target.value)}
                          className="w-[70px] rounded-chip border border-border bg-surface px-2 py-1 text-right text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
                        />
                      </div>
                      <div className="text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => removeDraftRow(i)}
                          className="text-[11px] text-muted hover:text-danger disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={pending || draft.items.length === 0}
                  onClick={saveCatalog}
                  className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
                >
                  {pending ? "Saving…" : "Save catalog"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={discardDraft}
                  className="text-[11px] text-muted hover:text-ink disabled:opacity-50"
                >
                  Discard draft
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}
    </div>
  );
}
