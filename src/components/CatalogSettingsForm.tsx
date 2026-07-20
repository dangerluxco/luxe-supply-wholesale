"use client";

import { useMemo, useState, useTransition } from "react";
import { money } from "@/lib/format";
import { portalDisplayTitle, portalShowSkuLine } from "@/components/PortalItemLine";
import { Placeholder } from "@/components/Placeholder";

/**
 * Catalog edits via fetch APIs — no `"use server"` imports (soft-nav safe).
 */

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

function marginFor(cost: number | null, price: number | null): {
  amount: number | null;
  percent: number | null;
} {
  if (cost == null || price == null || !Number.isFinite(cost) || !Number.isFinite(price)) {
    return { amount: null, percent: null };
  }
  const amount = price - cost;
  const percent = price > 0 ? Math.round((amount / price) * 100) : null;
  return { amount, percent };
}

// New items land at the TOP of the working list (not appended) so a fresh
// import batch is immediately visible instead of getting lost below whatever
// was already there.
function mergeCatalogItems(
  existing: CuratedCatalogItem[],
  incoming: CuratedCatalogItem[],
): { items: CuratedCatalogItem[]; added: number; skipped: number; addedSkuKeys: string[] } {
  const seen = new Set(existing.map((i) => i.sku.trim().toLowerCase()).filter(Boolean));
  const toAdd: CuratedCatalogItem[] = [];
  let skipped = 0;
  for (const item of incoming) {
    const key = item.sku.trim().toLowerCase();
    if (!key || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    toAdd.push(item);
  }
  return {
    items: [...toAdd, ...existing],
    added: toAdd.length,
    skipped,
    addedSkuKeys: toAdd.map((i) => i.sku.trim().toLowerCase()),
  };
}

type ParsedBatchRow = { sku: string; overridePrice: number | null };

// Column-header labels spreadsheets commonly carry along with a two-column
// SKU/price paste (e.g. a "CLIENT" title row, then "SKU" / "SALE PRICE").
// These aren't real inventory rows and should be dropped silently.
const HEADER_SKU_LABELS = new Set([
  "sku",
  "skus",
  "client",
  "item",
  "item id",
  "product",
  "upc",
  "code",
  "part number",
  "part #",
]);

function isHeaderRow(sku: string, priceRaw: string): boolean {
  if (HEADER_SKU_LABELS.has(sku.toLowerCase())) return true;
  if (priceRaw && !/\d/.test(priceRaw) && /price|cost|amount/i.test(priceRaw)) return true;
  return false;
}

/**
 * Parses a pasted spreadsheet block — one row per line, columns separated by
 * tab (a plain paste from Excel/Sheets) or comma (CSV). First column is the
 * SKU; a second column, if present, is a sale price that overrides the
 * calculated cost/0.8 default entirely (flagged via `priceOverridden`).
 *
 * Only the outer line break is trusted — individual lines are NOT pre-trimmed
 * before splitting, since a blank-SKU row like "\t$0.00" (an unused
 * spreadsheet row) has its meaningful leading tab stripped by an eager trim.
 */
function parseBatchRows(text: string): {
  rows: ParsedBatchRow[];
  duplicatesInPaste: number;
  blankRows: number;
  headerRows: number;
  invalidPriceSkus: string[];
} {
  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const rows: ParsedBatchRow[] = [];
  const invalidPriceSkus: string[] = [];
  let duplicatesInPaste = 0;
  let blankRows = 0;
  let headerRows = 0;

  for (const line of lines) {
    if (line.trim() === "") continue;
    const cols = line.includes("\t")
      ? line.split("\t")
      : line.includes(",")
        ? line.split(",")
        : [line];
    const sku = (cols[0] || "").trim();
    const priceRaw = cols[1] != null ? cols[1].trim() : "";

    if (!sku) {
      blankRows += 1;
      continue;
    }
    if (isHeaderRow(sku, priceRaw)) {
      headerRows += 1;
      continue;
    }
    const key = sku.toLowerCase();
    if (seen.has(key)) {
      duplicatesInPaste += 1;
      continue;
    }
    seen.add(key);

    let overridePrice: number | null = null;
    if (priceRaw) {
      const parsed = Number(priceRaw.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) {
        overridePrice = Math.round(parsed);
      } else {
        invalidPriceSkus.push(sku);
      }
    }
    rows.push({ sku, overridePrice });
  }

  return { rows, duplicatesInPaste, blankRows, headerRows, invalidPriceSkus };
}

export function CatalogSettingsForm({
  mode,
  curatedCatalog,
}: {
  mode: string;
  curatedCatalog: CuratedCatalog | null;
}) {
  const [curated, setCurated] = useState<CuratedCatalog | null>(curatedCatalog);
  const [draft, setDraft] = useState<{ items: CuratedCatalogItem[] }>({
    items: curatedCatalog?.items || [],
  });
  const [batchText, setBatchText] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAddedSkuKeys, setJustAddedSkuKeys] = useState<Set<string>>(new Set());

  const draftUnresolvedSkus = useMemo(
    () => draft.items.filter((i) => !i.inDb).map((i) => i.sku),
    [draft],
  );
  const draftUnresolvedCount = draftUnresolvedSkus.length;
  const draftTotal = useMemo(
    () => draft.items.reduce((sum, i) => sum + (i.price || 0), 0),
    [draft],
  );
  const savedItems = curated?.items || [];
  const dirty = useMemo(
    () => JSON.stringify(draft.items) !== JSON.stringify(savedItems),
    [draft.items, savedItems],
  );

  const filteredDraft = useMemo(() => {
    const q = listQuery.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) {
      return draft.items.map((item, index) => ({ item, index }));
    }
    return draft.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const hay = [item.title, item.sku, item.brand]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  }, [draft.items, listQuery]);

  function addBatchToDraft() {
    setError(null);
    setMessage(null);
    const { rows, duplicatesInPaste, blankRows, headerRows, invalidPriceSkus } =
      parseBatchRows(batchText);
    if (!rows.length) {
      setError("Paste at least one SKU.");
      return;
    }
    const overridePriceBySku = new Map(
      rows
        .filter((r) => r.overridePrice != null)
        .map((r) => [r.sku.toLowerCase(), r.overridePrice as number]),
    );
    start(async () => {
      const res = await fetch("/api/staff/catalog/resolve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skusText: rows.map((r) => r.sku).join("\n") }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: CuratedCatalogItem[];
      };
      if (!res.ok || data.error || !data.items) {
        setError(data.error || "Could not resolve SKUs.");
        return;
      }
      // A pasted sale price wins outright over the calculated cost/0.8 default.
      const withOverrides = data.items.map((it) => {
        const override = overridePriceBySku.get(it.sku.trim().toLowerCase());
        return override != null ? { ...it, price: override, priceOverridden: true } : it;
      });
      const merged = mergeCatalogItems(draft.items, withOverrides);
      setDraft({ items: merged.items });
      setJustAddedSkuKeys(new Set(merged.addedSkuKeys));
      setBatchText("");

      const notFoundCount = withOverrides.filter((it) => !it.inDb).length;
      const parts = [`Added ${merged.added} new item${merged.added === 1 ? "" : "s"}`];
      if (merged.skipped) {
        parts.push(`${merged.skipped} already in the working list`);
      }
      if (duplicatesInPaste) {
        parts.push(`${duplicatesInPaste} duplicate row${duplicatesInPaste === 1 ? "" : "s"} in the paste`);
      }
      if (blankRows) {
        parts.push(`${blankRows} blank row${blankRows === 1 ? "" : "s"} skipped`);
      }
      if (headerRows) {
        parts.push(`${headerRows} header row${headerRows === 1 ? "" : "s"} ignored`);
      }
      if (notFoundCount) {
        parts.push(`${notFoundCount} not found in inventory`);
      }
      if (invalidPriceSkus.length) {
        parts.push(
          `${invalidPriceSkus.length} had an unreadable price and used the calculated price instead`,
        );
      }
      setMessage(parts.join(" · ") + ".");
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
    setDraft({ items: curated?.items || [] });
    setJustAddedSkuKeys(new Set());
    setError(null);
    setMessage("Working changes discarded.");
  }

  function saveCatalog() {
    setError(null);
    setMessage(null);
    const unresolvedSkus = draft.items.filter((i) => !i.inDb).map((i) => i.sku);
    start(async () => {
      const res = await fetch("/api/staff/catalog/save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: draft.items, unresolvedSkus }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not save curated catalog.");
        return;
      }
      const now = new Date().toISOString();
      setCurated({ items: draft.items, unresolvedSkus, updatedAt: now, updatedBy: "you" });
      setJustAddedSkuKeys(new Set());
      setMessage(data.message || "Curated catalog saved.");
    });
  }

  return (
    <div className="mt-6 max-w-4xl space-y-4 rounded-card border border-border bg-surface p-6">
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
        CATALOG MANAGEMENT
      </div>
      <p className="text-[12.5px] text-secondary">
        The buyer storefront now uses this curated catalog. Remove items from the working list,
        paste batches of new SKUs, adjust prices, then save when ready.
      </p>

      {mode !== "sku_list" ? (
        <div className="rounded-chip border border-accent/30 bg-accent/5 px-3 py-2 text-[12px] text-secondary">
          Saving this catalog will switch the storefront to curated catalog mode.
        </div>
      ) : null}

      <div className="rounded-chip border border-border bg-ground p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
            LIVE SAVED CATALOG
          </span>
          <span className="text-[11px] text-muted">
            {savedItems.length} item{savedItems.length === 1 ? "" : "s"}
            {curated?.unresolvedSkus.length
              ? ` · ${curated.unresolvedSkus.length} unresolved`
              : ""}
            {curated?.updatedAt ? ` · updated ${fmtDate(curated.updatedAt)}` : ""}
            {curated?.updatedBy ? ` by ${curated.updatedBy}` : ""}
          </span>
        </div>
        <p className="mt-2 text-[11.5px] text-muted">
          The working list below starts from this saved catalog. Removing rows or adding a batch
          does not affect buyers until you click Save catalog.
        </p>
      </div>

      <div className="space-y-2 rounded-card border border-border bg-ground p-4">
        <label className="flex flex-col gap-1.5">
          <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
            ADD SKU BATCH — WITH OPTIONAL SALE PRICE
          </span>
          <textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            rows={5}
            placeholder={"Paste rows of SKU + sale price, one per line — e.g. from a spreadsheet:\nABC-123\t249\nABC-124, 189\nABC-125"}
            className="rounded-chip border border-border bg-surface px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !batchText.trim()}
            onClick={addBatchToDraft}
            className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
          >
            {pending ? "Resolving…" : "Add batch to working list"}
          </button>
          <span className="text-[11px] text-muted">
            New items land at the top of the list, highlighted below. A second column (tab or
            comma separated) sets the sale price directly, overriding the calculated cost/0.8
            price. Rows already in the working list are skipped so batches can be pasted
            repeatedly.
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
            WORKING CATALOG — {draft.items.length} ITEM{draft.items.length === 1 ? "" : "S"}
          </span>
          <span className="font-mono text-[12px] text-ink">
            {money(Math.round(draftTotal))} total
            {dirty ? " · unsaved changes" : " · saved"}
          </span>
        </div>

        {draft.items.length > 0 ? (
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Search working catalog</span>
            <input
              type="search"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Search title, SKU, or brand to find items to remove…"
              className="h-10 w-full rounded-chip border border-border bg-surface px-3 text-[12.5px] text-ink outline-none focus:border-accent"
              autoComplete="off"
              enterKeyHint="search"
            />
            {listQuery.trim() ? (
              <span className="text-[11px] text-muted">
                Showing {filteredDraft.length} of {draft.items.length}
                {filteredDraft.length === 0 ? " — try a different search" : ""}
              </span>
            ) : null}
          </label>
        ) : null}

        {draftUnresolvedCount > 0 ? (
          <div className="space-y-1.5 rounded-chip border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
            <div>
              {draftUnresolvedCount} SKU{draftUnresolvedCount === 1 ? "" : "s"} not found in
              inventory — remove or fix before saving.
            </div>
            <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
              {draftUnresolvedSkus.map((sku, i) => (
                <span
                  key={`${sku}-${i}`}
                  className="rounded-chip border border-danger/40 bg-surface px-1.5 py-0.5"
                >
                  {sku}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {draft.items.length === 0 ? (
          <div className="rounded-chip border border-border px-4 py-8 text-center text-[12.5px] text-muted">
            No items in the working catalog yet. Paste a SKU batch above to start.
          </div>
        ) : filteredDraft.length === 0 ? (
          <div className="rounded-chip border border-border px-4 py-8 text-center text-[12.5px] text-muted">
            No items match “{listQuery.trim()}”.
          </div>
        ) : (
          <div className="overflow-hidden rounded-chip border border-border">
            <div className="grid grid-cols-[88px_minmax(180px,1fr)_90px_60px_110px_90px_70px_56px] items-center border-b border-border bg-ground px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              <span />
              <span>Item</span>
              <span className="text-right">Cost</span>
              <span className="text-center">In DB</span>
              <span className="text-right">Price</span>
              <span className="text-right">Margin $</span>
              <span className="text-right">Margin %</span>
              <span />
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {filteredDraft.map(({ item, index }) => {
                const margin = marginFor(item.cost, item.price);
                const isNew = justAddedSkuKeys.has(item.sku.trim().toLowerCase());
                return (
                  <div
                    key={`${item.sku}-${index}`}
                    className={
                      "grid grid-cols-[88px_minmax(180px,1fr)_90px_60px_110px_90px_70px_56px] items-center border-b border-border/60 px-3 py-2.5 text-[12.5px] last:border-b-0" +
                      (isNew ? " bg-accent/[0.06]" : "")
                    }
                  >
                    <Placeholder
                      imageSrc={item.imageUrl}
                      alt={portalDisplayTitle(item.title, item.sku)}
                      className="h-20 w-20 shrink-0 rounded-chip"
                    />
                    <div className="min-w-0 px-2">
                      <div className="flex items-center gap-1.5 truncate text-ink">
                        {isNew ? (
                          <span className="micro-badge shrink-0 rounded-chip bg-accent px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-ground">
                            NEW
                          </span>
                        ) : null}
                        <span className="truncate">{portalDisplayTitle(item.title, item.sku)}</span>
                      </div>
                      {portalShowSkuLine(item.title, item.sku) ? (
                        <div className="truncate font-mono text-[11px] text-muted">{item.sku}</div>
                      ) : null}
                      {item.brand ? (
                        <div className="truncate text-[11px] text-muted">{item.brand}</div>
                      ) : null}
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
                        onChange={(e) => updateDraftPrice(index, e.target.value)}
                        title={item.priceOverridden ? "Manually set — not the calculated price" : undefined}
                        className={
                          "w-[70px] rounded-chip border bg-surface px-2 py-1 text-right text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60 " +
                          (item.priceOverridden ? "border-accent/50" : "border-border")
                        }
                      />
                    </div>
                    <span
                      className={
                        "text-right font-mono " +
                        (margin.amount != null && margin.amount < 0 ? "text-danger" : "text-ink")
                      }
                    >
                      {margin.amount != null ? money(Math.round(margin.amount)) : "—"}
                    </span>
                    <span
                      className={
                        "text-right font-mono " +
                        (margin.percent != null && margin.percent < 0 ? "text-danger" : "text-secondary")
                      }
                    >
                      {margin.percent != null ? `${margin.percent}%` : "—"}
                    </span>
                    <div className="text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => removeDraftRow(index)}
                        className="text-[11px] text-muted hover:text-danger disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || draft.items.length === 0 || !dirty}
            onClick={saveCatalog}
            className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save catalog"}
          </button>
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={discardDraft}
            className="text-[11px] text-muted hover:text-ink disabled:opacity-50"
          >
            Discard changes
          </button>
        </div>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}
    </div>
  );
}
