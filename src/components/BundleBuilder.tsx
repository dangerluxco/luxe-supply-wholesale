"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bundlePricing } from "@/lib/bundle";
import { BUNDLE_DEFAULT_DISCOUNT_PERCENT } from "@/lib/constants";
import { money } from "@/lib/format";
import { MARGIN_TARGET_PERCENT, marginFor, marginTone, marginToneClass, type MarginTone } from "@/lib/pricing";
import { Placeholder } from "./Placeholder";
import { MicroBadge } from "./badges";
import { clsx } from "@/lib/clsx";

type Item = {
  sku: string;
  name: string;
  wholesalePrice: number;
  cost: number | null;
  imageUrl: string | null;
  brand?: string;
  available: boolean;
};

type BuyerOption = {
  username: string;
  displayName: string;
  company: string;
};

export type BundleBuilderInitialLot = {
  id: string;
  title: string;
  note?: string;
  buyerUsername: string;
  publishedToAll?: boolean;
  lotPrice: number | null;
  /** SKUs already on the lot — pre-selected; must also appear in `items` where possible. */
  skus: string[];
};

/** Sentinel select value for publishing a lot to every buyer. */
export const BUNDLE_AUDIENCE_ALL = "__all__";

function uniqueBySku(items: Item[]): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const it of items) {
    const sku = String(it.sku || "").trim();
    if (!sku) continue;
    const key = sku.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...it, sku });
  }
  return out;
}

/** Parses a paste-to-pin blob — SKUs one per line, comma-separated, or space-separated
 * (barcode scanners send a single code followed by Enter, which lands here too). */
function parsePinSkus(text: string): string[] {
  const tokens = text
    .split(/[\r\n,]+/)
    .flatMap((line) => line.trim().split(/\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

type ResolvedCatalogItem = {
  sku: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  inDb: boolean;
  cost: number | null;
  price: number | null;
};

export function BundleBuilder({
  items,
  buyers,
  repName,
  initialLot,
}: {
  items: Item[];
  buyers: BuyerOption[];
  repName: string;
  initialLot?: BundleBuilderInitialLot | null;
}) {
  const baseInventory = useMemo(() => uniqueBySku(items), [items]);
  const editing = Boolean(initialLot?.id);

  // Items resolved live via paste-to-pin that weren't in the preloaded catalog window —
  // merged in locally so they render/select exactly like any other piece.
  const router = useRouter();
  const [extraItems, setExtraItems] = useState<Item[]>([]);
  const inventory = useMemo(
    () => uniqueBySku([...baseInventory, ...extraItems]),
    [baseInventory, extraItems],
  );

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (!initialLot?.skus?.length) return new Set();
    const byLower = new Map(
      uniqueBySku(items).map((i) => [i.sku.toLowerCase(), i.sku] as const),
    );
    const next = new Set<string>();
    for (const raw of initialLot.skus) {
      const sku = String(raw || "").trim();
      if (!sku) continue;
      next.add(byLower.get(sku.toLowerCase()) || sku);
    }
    return next;
  });
  const [name, setName] = useState(initialLot?.title || "The Collector's Edit");
  const [note, setNote] = useState(initialLot?.note || "");
  // New lots default to ALL clients — a fresh bundle preselecting the first
  // buyer in the list published to one person by accident. Editing an
  // existing lot keeps its stored audience.
  const [buyerUsername, setBuyerUsername] = useState(
    initialLot
      ? initialLot.publishedToAll
        ? BUNDLE_AUDIENCE_ALL
        : initialLot.buyerUsername || BUNDLE_AUDIENCE_ALL
      : BUNDLE_AUDIENCE_ALL,
  );
  const [saving, startSave] = useTransition();
  const saveInFlight = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const initialPrices = useMemo(() => {
    if (!initialLot?.skus?.length) return null;
    const prices = initialLot.skus
      .map((sku) => inventory.find((i) => i.sku.toLowerCase() === sku.toLowerCase())?.wholesalePrice)
      .filter((p): p is number => p != null && Number.isFinite(p));
    if (!prices.length || initialLot.lotPrice == null) return null;
    const sum = prices.reduce((a, b) => a + b, 0);
    const flat = Math.max(0, sum - initialLot.lotPrice);
    return { flat, sum };
  }, [initialLot, inventory]);

  const [discountType, setDiscountType] = useState<"PERCENT" | "FLAT">(
    initialPrices ? "FLAT" : "PERCENT",
  );
  const [discountValue, setDiscountValue] = useState(
    initialPrices ? initialPrices.flat : BUNDLE_DEFAULT_DISCOUNT_PERCENT,
  );
  const [query, setQuery] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pinning, startPin] = useTransition();
  const [pinFeedback, setPinFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);

  // Selected order: lot’s saved SKU order first, then any newly toggled-on SKUs
  // (inventory order). Display partitions selected above unselected.
  const selectedOrder = useMemo(() => {
    const byLower = new Map(inventory.map((i) => [i.sku.toLowerCase(), i.sku] as const));
    const ordered: string[] = [];
    const used = new Set<string>();
    for (const raw of initialLot?.skus || []) {
      const sku = byLower.get(String(raw || "").trim().toLowerCase());
      if (!sku || !selected.has(sku) || used.has(sku.toLowerCase())) continue;
      ordered.push(sku);
      used.add(sku.toLowerCase());
    }
    for (const it of inventory) {
      if (!selected.has(it.sku) || used.has(it.sku.toLowerCase())) continue;
      ordered.push(it.sku);
      used.add(it.sku.toLowerCase());
    }
    return ordered;
  }, [initialLot?.skus, inventory, selected]);

  const inventoryBySku = useMemo(
    () => new Map(inventory.map((i) => [i.sku, i] as const)),
    [inventory],
  );

  // Selection is SKU-unique; preserve selectedOrder for form/preview/pricing.
  const chosen = selectedOrder
    .map((sku) => inventoryBySku.get(sku))
    .filter((i): i is Item => !!i);
  const prices = chosen.map((i) => i.wholesalePrice);
  const { sum, saveAmt, bundlePrice, savePct } = useMemo(
    () => bundlePricing(prices, discountType, discountValue),
    [prices, discountType, discountValue],
  );
  const sumCost = useMemo(
    () =>
      chosen.reduce((s, i) => (i.cost != null && Number.isFinite(i.cost) ? s + i.cost : s), 0),
    [chosen],
  );
  const knownCostCount = useMemo(
    () => chosen.filter((i) => i.cost != null && Number.isFinite(i.cost)).length,
    [chosen],
  );
  const marginAmount = knownCostCount > 0 ? bundlePrice - sumCost : null;
  const marginPct =
    marginAmount != null && bundlePrice > 0
      ? Math.round((marginAmount / bundlePrice) * 100)
      : null;
  const publishedToAll = buyerUsername === BUNDLE_AUDIENCE_ALL;
  const buyer = publishedToAll
    ? null
    : buyers.find((b) => b.username === buyerUsername);

  // Picker rows stay in inventory order — toggling an item on must NOT jump it
  // to the top (it makes the list feel like it reshuffles under your cursor).
  // `selectedOrder`/`chosen` still track selection order for preview + pricing.
  const filtered = useMemo(() => {
    const matches = (i: Item) =>
      !query || `${i.name} ${i.sku}`.toLowerCase().includes(query.toLowerCase());
    return inventory.filter(matches);
  }, [inventory, query]);

  function toggle(sku: string, available: boolean) {
    if (!available) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  /** Paste-to-pin: resolve pasted/scanned SKUs and pin them straight into the bundle.
   * Known pieces pin immediately; unknown ones are resolved against inventory first
   * (added to the local picker) before pinning. */
  function pinFromText(raw: string) {
    const skus = parsePinSkus(raw);
    if (!skus.length) return;

    const byLower = new Map(inventory.map((i) => [i.sku.toLowerCase(), i] as const));
    const alreadyPinned: string[] = [];
    const toPinNow: string[] = [];
    const toResolve: string[] = [];
    for (const sku of skus) {
      const known = byLower.get(sku.toLowerCase());
      if (known && selected.has(known.sku)) {
        alreadyPinned.push(sku);
      } else if (known) {
        toPinNow.push(known.sku);
      } else {
        toResolve.push(sku);
      }
    }

    if (toPinNow.length) {
      setSelected((prev) => {
        const next = new Set(prev);
        toPinNow.forEach((s) => next.add(s));
        return next;
      });
    }
    setPasteText("");

    if (!toResolve.length) {
      const parts = [`${toPinNow.length} pinned`];
      if (alreadyPinned.length) parts.push(`${alreadyPinned.length} already in bundle`);
      setPinFeedback({ ok: toPinNow.length > 0, text: parts.join(" · ") + "." });
      pasteInputRef.current?.focus();
      return;
    }

    startPin(async () => {
      const res = await fetch("/api/staff/catalog/resolve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skusText: toResolve.join("\n") }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: ResolvedCatalogItem[];
      };
      if (!res.ok || data.error || !data.items) {
        setPinFeedback({ ok: false, text: data.error || "Could not resolve pasted SKUs." });
        pasteInputRef.current?.focus();
        return;
      }

      const found = data.items.filter((it) => it.inDb);
      const notFound = data.items.filter((it) => !it.inDb);

      if (found.length) {
        setExtraItems((prev) => {
          const seen = new Set(prev.map((i) => i.sku.toLowerCase()));
          const additions = found
            .filter((it) => !seen.has(it.sku.toLowerCase()))
            .map((it) => ({
              sku: it.sku,
              name: it.title || it.sku,
              wholesalePrice: it.price ?? 0,
              cost: it.cost,
              imageUrl: it.imageUrl,
              brand: it.brand,
              available: true,
            }));
          return [...prev, ...additions];
        });
        setSelected((prev) => {
          const next = new Set(prev);
          found.forEach((it) => next.add(it.sku));
          return next;
        });
      }

      const parts = [`${toPinNow.length + found.length} pinned`];
      if (found.length) parts.push(`${found.length} new item${found.length === 1 ? "" : "s"} added`);
      if (alreadyPinned.length) parts.push(`${alreadyPinned.length} already in bundle`);
      if (notFound.length) parts.push(`${notFound.length} not found in inventory`);
      setPinFeedback({ ok: toPinNow.length + found.length > 0, text: parts.join(" · ") + "." });
      pasteInputRef.current?.focus();
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px]">
      <div className="border-b border-border p-8 lg:border-b-0 lg:border-r">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[24px] font-semibold text-ink">
            {editing ? "Edit bundle" : "New bundle"}
          </h1>
          {editing ? (
            <a
              href="/wholesaleportal/rep/bundles"
              className="text-[11px] uppercase tracking-[0.1em] text-muted hover:text-ink"
            >
              ← Cancel
            </a>
          ) : null}
        </div>
        <p className="mb-5 text-[12px] text-muted">
          {editing
            ? "Update this suggested lot — changes publish to the selected audience on the storefront."
            : "Curate a suggested lot for one client or every client. Active lot SKUs stay off individual sale."}
        </p>

        <label className="mb-4 block">
          <div className="mb-1.5 micro-badge text-[10px] tracking-[0.14em] text-accent">
            AUDIENCE
          </div>
          <select
            value={buyerUsername}
            onChange={(e) => setBuyerUsername(e.target.value)}
            className="h-10 w-full rounded-chip border border-border bg-ground px-3.5 text-[13px] text-ink outline-none focus:border-accent"
          >
            <option value={BUNDLE_AUDIENCE_ALL}>All clients</option>
            {buyers.map((b) => (
              <option key={b.username} value={b.username}>
                {b.displayName || b.username}
                {b.company ? ` · ${b.company}` : ""} ({b.username})
              </option>
            ))}
          </select>
          {publishedToAll ? (
            <p className="mt-1.5 text-[11px] text-muted">
              Every signed-in buyer will see this lot. SKUs still leave the individual catalog while
              the lot is active.
            </p>
          ) : null}
        </label>

        <div className="mb-4 rounded-chip border border-border bg-ground p-3">
          <div className="mb-1.5 micro-badge text-[10px] tracking-[0.14em] text-accent">
            PIN SKUS — PASTE OR SCAN
          </div>
          <textarea
            ref={pasteInputRef}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                pinFromText(pasteText);
              }
            }}
            rows={2}
            placeholder="Scan or paste SKUs — one per line, comma, or space separated. Enter pins immediately."
            className="w-full rounded-chip border border-border bg-surface px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pinning || !pasteText.trim()}
              onClick={() => pinFromText(pasteText)}
              className="h-8 rounded-chip bg-ink px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ground disabled:opacity-50"
            >
              {pinning ? "Pinning…" : "Pin to bundle"}
            </button>
            <span className="text-[11px] text-muted">
              Known pieces pin instantly; new SKUs are added to the catalog, then pinned.
            </span>
          </div>
          {pinFeedback ? (
            <p className={"mt-1.5 text-[11.5px] " + (pinFeedback.ok ? "text-[#4E9A6A]" : "text-danger")}>
              {pinFeedback.text}
            </p>
          ) : null}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="⌕  Search inventory…"
          className="mb-4 h-9 w-full rounded-chip border border-border bg-ground px-3.5 text-[12.5px] text-ink outline-none focus:border-accent"
        />

        <div className="grid grid-cols-[32px_88px_1fr_80px_90px_72px_64px_72px] border-b border-ink/20 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          <span />
          <span />
          <span>Piece</span>
          <span className="text-right">Cost</span>
          <span className="text-right">Wholesale</span>
          <span className="text-right">Margin $</span>
          <span className="text-right">Margin %</span>
          <span className="text-center">Status</span>
        </div>

        <div className="max-h-[420px] overflow-auto">
          {filtered.map((it, index) => {
            const on = selected.has(it.sku);
            const margin = marginFor(it.cost, it.wholesalePrice);
            return (
              <button
                key={`${it.sku}-${index}`}
                type="button"
                onClick={() => toggle(it.sku, it.available)}
                className={clsx(
                  "grid w-full grid-cols-[32px_88px_1fr_80px_90px_72px_64px_72px] items-center border-b border-border/60 py-2.5 text-left text-[12.5px] transition",
                  !it.available && "cursor-not-allowed opacity-45",
                  on && "bg-accent/5",
                )}
              >
                <span>
                  <span
                    className={clsx(
                      "flex h-3.5 w-3.5 items-center justify-center border text-[9px]",
                      on ? "border-accent bg-accent text-white" : "border-ink/30",
                    )}
                  >
                    {on ? "✓" : ""}
                  </span>
                </span>
                <Placeholder imageSrc={it.imageUrl} alt={it.name} className="h-20 w-20 rounded" />
                <span className="min-w-0 text-ink">
                  <span className="block truncate">{it.name}</span>
                  <span className="block truncate font-mono text-[10.5px] text-muted">{it.sku}</span>
                </span>
                <span className="text-right font-mono text-secondary">
                  {it.cost != null ? money(it.cost) : "—"}
                </span>
                <span className="text-right font-mono">{money(it.wholesalePrice)}</span>
                <span className={clsx("text-right font-mono", marginToneClass(marginTone(margin.percent)))}>
                  {margin.amount != null ? money(Math.round(margin.amount)) : "—"}
                </span>
                <span className={clsx("text-right font-mono", marginToneClass(marginTone(margin.percent)))}>
                  {margin.percent != null ? `${margin.percent}%` : "—"}
                </span>
                <span
                  className="text-center font-mono text-[10px] tracking-[0.08em]"
                  style={{ color: it.available ? "#4E9A6A" : "#B08D3E" }}
                >
                  {it.available ? "AVAIL" : "HELD"}
                </span>
              </button>
            );
          })}
        </div>

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            // Double-click guard: two rapid submits published duplicate lots —
            // useTransition's `saving` flips too late to stop the second click.
            if (saveInFlight.current) return;
            saveInFlight.current = true;
            setSaveError(null);
            startSave(async () => {
              const res = await fetch("/api/staff/bundles/save", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  lotId: editing && initialLot ? initialLot.id : "",
                  buyerUsername,
                  buyerDisplayName: publishedToAll
                    ? "All clients"
                    : buyer?.displayName || buyerUsername,
                  publishedToAll,
                  name,
                  note,
                  lotPrice: bundlePrice,
                  skus: chosen.map((c) => c.sku),
                  titles: chosen.map((c) => c.name),
                  brands: chosen.map((c) => c.brand || ""),
                  imageUrls: chosen.map((c) => c.imageUrl || ""),
                }),
              });
              const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                redirectTo?: string;
              };
              if (!res.ok || data.error) {
                saveInFlight.current = false;
                setSaveError(data.error || "Could not save bundle.");
                return;
              }
              // Intentionally NOT released on success — the redirect unmounts
              // this form, and releasing early would re-arm the button.
              router.push(data.redirectTo || "/wholesaleportal/rep/bundles");
            });
          }}
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_200px]">
            <label>
              <div className="mb-1.5 micro-badge text-[10px] tracking-[0.14em] text-accent">
                BUNDLE NAME
              </div>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full rounded-chip border border-border bg-ground px-3.5 text-[15px] text-ink outline-none focus:border-accent"
              />
            </label>
            <div>
              <div className="mb-1.5 micro-badge text-[10px] tracking-[0.14em] text-accent">
                DISCOUNT
              </div>
              <div className="flex h-10 items-center rounded-chip border border-border bg-ground">
                <input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                  className="h-full w-14 rounded-l-chip bg-transparent px-3 text-center font-mono text-[13px] text-ink outline-none"
                />
                <button
                  type="button"
                  onClick={() => setDiscountType("PERCENT")}
                  className={clsx(
                    "h-full flex-1 font-mono text-[12px]",
                    discountType === "PERCENT" ? "bg-accent/15 text-ink" : "text-muted",
                  )}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType("FLAT")}
                  className={clsx(
                    "h-full flex-1 rounded-r-chip font-mono text-[12px]",
                    discountType === "FLAT" ? "bg-accent/15 text-ink" : "text-muted",
                  )}
                >
                  $ flat
                </button>
              </div>
            </div>
          </div>

          <label className="mt-4 block">
            <div className="mb-1.5 micro-badge text-[10px] tracking-[0.14em] text-accent">NOTE</div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                publishedToAll
                  ? "Optional note for all clients…"
                  : "Optional note for the client…"
              }
              className="h-10 w-full rounded-chip border border-border bg-ground px-3.5 text-[13px] text-ink outline-none focus:border-accent"
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={
                saving ||
                chosen.length === 0 ||
                (!publishedToAll && !buyerUsername)
              }
              className="h-11 rounded-chip bg-ink px-8 text-[11.5px] uppercase tracking-[0.14em] text-ground disabled:opacity-40"
            >
              {saving
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : publishedToAll
                    ? "Publish to all clients"
                    : "Publish to client"}
            </button>
            <span className="text-[11.5px] text-muted">
              {editing ? "Updates" : "Saves as"} a suggested lot · lot price {money(bundlePrice)}
            </span>
          </div>
          {saveError ? <p className="mt-3 text-[12px] text-danger">{saveError}</p> : null}
        </form>
      </div>

      <div className="bg-[#EFECE2] p-8">
        <div className="mb-4 flex items-center gap-2 micro-badge text-[10px] tracking-[0.14em] text-muted">
          <span className="h-[7px] w-[7px] rounded-full bg-success" />
          LIVE PREVIEW —{" "}
          {publishedToAll ? "AS ALL CLIENTS WILL SEE IT" : "AS THIS CLIENT WILL SEE IT"}
        </div>

        <div className="overflow-hidden rounded-card bg-ink p-6">
          <div className="flex items-center gap-2.5">
            <MicroBadge tone="solid-gold" className="tracking-[0.12em]">
              CURATED BUNDLE
            </MicroBadge>
            <span className="font-mono text-[10.5px] text-[#8B897F]">by {repName}</span>
          </div>
          <div className="mt-3 text-[23px] font-semibold text-ground">
            {name || "Untitled bundle"}
          </div>
          {publishedToAll ? (
            <div className="mt-1 font-mono text-[11px] text-[#8B897F]">for all clients</div>
          ) : buyerUsername ? (
            <div className="mt-1 font-mono text-[11px] text-[#8B897F]">for @{buyerUsername}</div>
          ) : null}
          <div className="mt-3 flex gap-2">
            {chosen.length === 0 ? (
              <div className="flex h-[120px] w-full items-center justify-center rounded border border-white/10 font-mono text-[10px] text-white/40">
                select pieces to preview
              </div>
            ) : (
              chosen.slice(0, 5).map((c, i) => (
                <Placeholder
                  key={`${c.sku}-${i}`}
                  variant="dark"
                  imageSrc={c.imageUrl}
                  alt={c.name}
                  label={i === 4 && chosen.length > 5 ? `+${chosen.length - 4}` : undefined}
                  className="h-[120px] w-[120px] items-center justify-center rounded border border-white/10 text-[10px]"
                />
              ))
            )}
          </div>
          <div className="mt-4 flex flex-col gap-1.5 border-t border-white/10 pt-3">
            <div className="flex justify-between text-[12px] text-[#8B897F]">
              Individually<span className="font-mono line-through">{money(sum)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-[#C9C7BE]">As a bundle</span>
              <span className="text-[24px] font-semibold text-ground">{money(bundlePrice)}</span>
            </div>
            {chosen.length > 1 ? (
              <div className="flex justify-between text-[12px] text-[#C9C7BE]">
                Price per piece
                <span className="font-mono">{money(Math.round(bundlePrice / chosen.length))}</span>
              </div>
            ) : null}
            <div className="self-end micro-badge text-[9.5px] tracking-[0.12em] text-accent">
              SAVE {savePct}% · {money(saveAmt)}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 rounded-card border border-border bg-ground p-5 text-[12px] text-[#3A3934]">
          <Row k="Pieces selected" v={String(chosen.length)} />
          <Row k="Sum of wholesale" v={money(sum)} />
          <Row
            k={
              knownCostCount === chosen.length
                ? "Sum of cost"
                : knownCostCount > 0
                  ? `Sum of cost (${knownCostCount}/${chosen.length} known)`
                  : "Sum of cost"
            }
            v={knownCostCount > 0 ? money(Math.round(sumCost)) : "—"}
          />
          <Row
            k={`Discount (${discountType === "PERCENT" ? discountValue + "%" : "$" + discountValue})`}
            v={`−${money(saveAmt)}`}
            danger
          />
          <div className="flex justify-between border-t border-border pt-2">
            <span className="text-ink">Lot price</span>
            <span className="font-mono font-semibold text-ink">{money(bundlePrice)}</span>
          </div>
          <Row
            k="Margin $"
            v={marginAmount != null ? money(Math.round(marginAmount)) : "—"}
            tone={marginTone(marginPct)}
          />
          <Row
            k="Margin %"
            v={
              marginPct != null
                ? `${marginPct}% ${marginPct >= MARGIN_TARGET_PERCENT ? "✓" : "⚠"}`
                : "—"
            }
            tone={marginTone(marginPct)}
          />
        </div>
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  danger,
  good,
  tone,
}: {
  k: string;
  v: string;
  danger?: boolean;
  good?: boolean;
  tone?: MarginTone;
}) {
  const color = tone
    ? tone === "good"
      ? "#4E9A6A"
      : tone === "low"
        ? "#B08D3E"
        : tone === "negative"
          ? "#A65440"
          : "#16161A"
    : danger
      ? "#A65440"
      : good
        ? "#4E9A6A"
        : "#16161A";
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span className="font-mono" style={{ color }}>
        {v}
      </span>
    </div>
  );
}
