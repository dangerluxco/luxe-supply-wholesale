"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money } from "@/lib/format";
import { marginFor, marginToneClass, marginTone } from "@/lib/pricing";
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
  const router = useRouter();
  const [curated, setCurated] = useState<CuratedCatalog | null>(curatedCatalog);
  const [draft, setDraft] = useState<{ items: CuratedCatalogItem[] }>({
    items: curatedCatalog?.items || [],
  });
  const [batchText, setBatchText] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [bulkMarginPct, setBulkMarginPct] = useState("20");
  const [sortMode, setSortMode] = useState<"recent" | "az" | "price_asc" | "price_desc">("recent");
  const [showNewOnly, setShowNewOnly] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAddedSkuKeys, setJustAddedSkuKeys] = useState<Set<string>>(new Set());
  // Once a catalog is already saved and clean, hide the batch-add/edit tools by
  // default — further review happens in the complete catalog grid below, not here.
  const [reviewExpanded, setReviewExpanded] = useState(!curatedCatalog?.items.length);

  const draftUnresolvedSkus = useMemo(
    () => draft.items.filter((i) => !i.inDb).map((i) => i.sku),
    [draft],
  );
  const draftUnresolvedCount = draftUnresolvedSkus.length;
  const draftTotal = useMemo(
    () => draft.items.reduce((sum, i) => sum + (i.price || 0), 0),
    [draft],
  );
  const savedItems = useMemo(() => curated?.items || [], [curated]);
  const dirty = useMemo(
    () => JSON.stringify(draft.items) !== JSON.stringify(savedItems),
    [draft.items, savedItems],
  );

  const filteredDraft = useMemo(() => {
    const q = listQuery.trim().toLowerCase().replace(/\s+/g, " ");
    let rows = draft.items.map((item, index) => ({ item, index }));
    if (q) {
      rows = rows.filter(({ item }) => {
        const hay = [item.title, item.sku, item.brand]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (showNewOnly) {
      rows = rows.filter(({ item }) => justAddedSkuKeys.has(item.sku.trim().toLowerCase()));
    }
    if (sortMode === "az") {
      rows = [...rows].sort((a, b) =>
        (a.item.title || a.item.sku).localeCompare(b.item.title || b.item.sku, undefined, {
          sensitivity: "base",
        }),
      );
    } else if (sortMode === "price_asc") {
      rows = [...rows].sort((a, b) => (a.item.price ?? 0) - (b.item.price ?? 0));
    } else if (sortMode === "price_desc") {
      rows = [...rows].sort((a, b) => (b.item.price ?? 0) - (a.item.price ?? 0));
    }
    // "recent" = current array order, which already has newest batches at the top.
    return rows;
  }, [draft.items, listQuery, showNewOnly, sortMode, justAddedSkuKeys]);

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

  /**
   * Bulk pricing: set every (or just the new) costed row to a target profit
   * margin — % of price, matching lib/pricing.ts. 20% reproduces the cost÷0.8
   * formula default, so applying 20% clears the override flag rather than
   * marking every row "manually priced".
   */
  function applyBulkMargin(scope: "new" | "all") {
    const pct = Number(bulkMarginPct);
    if (!Number.isFinite(pct) || pct < 0 || pct >= 95) {
      setError("Target margin must be between 0 and 94%.");
      return;
    }
    setError(null);
    const applies = (it: CuratedCatalogItem) =>
      it.cost != null &&
      it.cost > 0 &&
      (scope === "all" || justAddedSkuKeys.has(it.sku.trim().toLowerCase()));
    const changed = draft.items.filter(applies).length;
    setDraft({
      items: draft.items.map((it) =>
        applies(it)
          ? {
              ...it,
              price: Math.round(it.cost! / (1 - pct / 100)),
              priceOverridden: pct !== 20,
            }
          : it,
      ),
    });
    setMessage(
      `Applied ${pct}% margin to ${changed} ${scope === "new" ? "new " : ""}item${changed === 1 ? "" : "s"} with a known cost — review below, then Save catalog.`,
    );
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

  function clearAllDraft() {
    if (draft.items.length === 0) return;
    const ok = window.confirm(
      `Remove all ${draft.items.length} item${draft.items.length === 1 ? "" : "s"} from the working list? This can't be undone (though nothing is saved until you click Save catalog).`,
    );
    if (!ok) return;
    setDraft({ items: [] });
    setJustAddedSkuKeys(new Set());
    setShowNewOnly(false);
    setMessage("Working list cleared.");
  }

  function clearEntireCatalog() {
    const ok = window.confirm(
      "Clear the ENTIRE storefront catalog?\n\nBuyers will immediately see an empty catalog until you publish a new curated list. The working list here is cleared too. This is the live storefront, not just the draft.",
    );
    if (!ok) return;
    setError(null);
    start(async () => {
      const res = await fetch("/api/staff/catalog/clear-all", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not clear the catalog.");
        return;
      }
      setDraft({ items: [] });
      setCurated({ items: [], unresolvedSkus: [], updatedAt: new Date().toISOString(), updatedBy: "you" });
      setJustAddedSkuKeys(new Set());
      setShowNewOnly(false);
      setMessage(data.message || "Storefront catalog cleared.");
      router.refresh();
    });
  }

  function saveCatalog() {
    setError(null);
    setMessage(null);
    const unresolvedSkus = draft.items.filter((i) => !i.inDb).map((i) => i.sku);
    // Hard guard (Save is also disabled): an unresolved SKU with a manual price
    // would pass the storefront's `price != null` filter and go live as a
    // phantom item with no inventory behind it.
    if (unresolvedSkus.length > 0) {
      setError(
        `Cannot save with ${unresolvedSkus.length} unresolved SKU${
          unresolvedSkus.length === 1 ? "" : "s"
        } — remove or fix: ${unresolvedSkus.join(", ")}`,
      );
      return;
    }
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
      setReviewExpanded(false);
      setMessage(data.message || "Curated catalog saved.");
      // Re-render the server-side catalog grid around this form (and bust the
      // 30s client route cache) so the saved list shows without a manual reload.
      router.refresh();
    });
  }

  return (
    <div className="mt-6 max-w-4xl space-y-4 rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
          CATALOG MANAGEMENT
        </div>
        <div className="flex rounded-chip border border-border p-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]">
          <button
            type="button"
            onClick={() => setReviewExpanded(false)}
            className={
              "rounded-chip px-3 py-1.5 transition " +
              (!reviewExpanded ? "bg-ink text-ground" : "text-secondary hover:text-ink")
            }
          >
            Browse
          </button>
          <button
            type="button"
            onClick={() => setReviewExpanded(true)}
            className={
              "rounded-chip px-3 py-1.5 transition " +
              (reviewExpanded ? "bg-ink text-ground" : "text-secondary hover:text-ink")
            }
          >
            Import
          </button>
        </div>
      </div>
      <p className="text-[12.5px] text-secondary">
        {reviewExpanded
          ? "Import mode — paste batches of new SKUs, adjust prices, review the working list, then save when ready."
          : "Browse mode — the batch-import tools are tucked away. Switch to Import to paste more SKUs or edit the working list."}
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
          {reviewExpanded
            ? "The working list below starts from this saved catalog. Removing rows or adding a batch does not affect buyers until you click Save catalog."
            : "Saved and live. Browse or edit any item directly in the complete catalog below, or switch to Import to paste in more SKUs."}
        </p>
      </div>

      {reviewExpanded ? (
      <>
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
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Search title, SKU, or brand to find items to remove…"
                className="h-10 min-w-[220px] flex-1 rounded-chip border border-border bg-surface px-3 text-[12.5px] text-ink outline-none focus:border-accent"
                autoComplete="off"
                enterKeyHint="search"
              />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                className="h-10 rounded-chip border border-border bg-surface px-2.5 text-[12px] text-ink outline-none focus:border-accent"
              >
                <option value="recent">Sort: Recent</option>
                <option value="az">Sort: A–Z</option>
                <option value="price_asc">Sort: Price low–high</option>
                <option value="price_desc">Sort: Price high–low</option>
              </select>
              <label className="flex h-10 items-center gap-1.5 rounded-chip border border-border px-2.5 text-[12px] text-secondary">
                <input
                  type="checkbox"
                  checked={showNewOnly}
                  onChange={(e) => setShowNewOnly(e.target.checked)}
                  disabled={justAddedSkuKeys.size === 0}
                  className="h-3.5 w-3.5 accent-[var(--accent,#B08D3E)]"
                />
                New only
              </label>
              <button
                type="button"
                onClick={clearAllDraft}
                className="h-10 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted transition hover:border-danger hover:text-danger"
              >
                Clear all
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={clearEntireCatalog}
                title="Empties the LIVE storefront catalog (not just this draft) — buyers see nothing until a new list is published."
                className="h-10 rounded-chip border border-danger/50 bg-danger/5 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-danger transition hover:bg-danger/10 disabled:opacity-50"
              >
                Clear entire catalog
              </button>
            </div>
            {listQuery.trim() || showNewOnly ? (
              <span className="text-[11px] text-muted">
                Showing {filteredDraft.length} of {draft.items.length}
                {filteredDraft.length === 0 ? " — try different filters" : ""}
              </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 rounded-chip border border-border bg-ground px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Bulk price
              </span>
              <label className="flex items-center gap-1 font-mono text-[12px] text-ink">
                <input
                  type="number"
                  min={0}
                  max={94}
                  value={bulkMarginPct}
                  onChange={(e) => setBulkMarginPct(e.target.value)}
                  className="h-8 w-[60px] rounded-chip border border-border bg-surface px-2 text-right outline-none focus:border-accent"
                />
                % margin
              </label>
              <button
                type="button"
                disabled={pending || justAddedSkuKeys.size === 0}
                onClick={() => applyBulkMargin("new")}
                className="h-8 rounded-chip border border-border px-2.5 text-[11px] font-semibold text-secondary transition hover:border-accent hover:text-ink disabled:opacity-50"
              >
                Apply to new
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => applyBulkMargin("all")}
                className="h-8 rounded-chip border border-border px-2.5 text-[11px] font-semibold text-secondary transition hover:border-accent hover:text-ink disabled:opacity-50"
              >
                Apply to all
              </button>
              <span className="text-[10.5px] text-muted">
                20% = the standard cost ÷ 0.8 price · skips rows with no cost · pasted/manual prices get overwritten
              </span>
            </div>
          </div>
        ) : null}

        {draftUnresolvedCount > 0 ? (
          <div className="space-y-1.5 rounded-chip border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {draftUnresolvedCount} SKU{draftUnresolvedCount === 1 ? "" : "s"} not found in
                inventory — Save is disabled until they are removed or fixed.
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  setDraft((d) => ({ ...d, items: d.items.filter((i) => i.inDb) }))
                }
                className="rounded-chip border border-danger/40 bg-surface px-2 py-1 text-[11px] font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                Remove all unresolved
              </button>
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
            {listQuery.trim()
              ? `No items match "${listQuery.trim()}".`
              : "No new items in this working list right now."}
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
                        <Link
                          href={`/wholesaleportal/rep/catalog/${encodeURIComponent(item.sku)}/edit`}
                          className="truncate hover:text-accent hover:underline"
                        >
                          {portalDisplayTitle(item.title, item.sku)}
                        </Link>
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
                    <span className={"text-right font-mono " + marginToneClass(marginTone(margin.percent))}>
                      {margin.amount != null ? money(Math.round(margin.amount)) : "—"}
                    </span>
                    <span className={"text-right font-mono " + marginToneClass(marginTone(margin.percent))}>
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
            disabled={
              pending || draft.items.length === 0 || !dirty || draftUnresolvedCount > 0
            }
            onClick={saveCatalog}
            title={
              draftUnresolvedCount > 0
                ? "Remove or fix the unresolved SKUs above before saving."
                : undefined
            }
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
          <button
            type="button"
            onClick={() => setReviewExpanded(false)}
            className="text-[11px] text-muted hover:text-ink"
          >
            Switch to Browse
          </button>
        </div>
      </div>
      </>
      ) : null}

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}
    </div>
  );
}
