"use client";

import { useMemo, useState } from "react";
import { saveSuggestedLotAction } from "@/lib/actions/bundles-firestore";
import { bundlePricing, bundleMargin } from "@/lib/bundle";
import { BUNDLE_DEFAULT_DISCOUNT_PERCENT } from "@/lib/constants";
import { money } from "@/lib/format";
import { Placeholder } from "./Placeholder";
import { MicroBadge } from "./badges";
import { clsx } from "@/lib/clsx";

type Item = {
  sku: string;
  name: string;
  wholesalePrice: number;
  imageUrl: string | null;
  brand?: string;
  available: boolean;
};

type BuyerOption = {
  username: string;
  displayName: string;
  company: string;
};

export function BundleBuilder({
  items,
  buyers,
  repName,
}: {
  items: Item[];
  buyers: BuyerOption[];
  repName: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("The Collector's Edit");
  const [buyerUsername, setBuyerUsername] = useState(buyers[0]?.username || "");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [discountValue, setDiscountValue] = useState(BUNDLE_DEFAULT_DISCOUNT_PERCENT);
  const [query, setQuery] = useState("");

  const chosen = items.filter((i) => selected.has(i.sku));
  const prices = chosen.map((i) => i.wholesalePrice);
  const { sum, saveAmt, bundlePrice, savePct } = useMemo(
    () => bundlePricing(prices, discountType, discountValue),
    [prices, discountType, discountValue],
  );
  const margin = bundleMargin(bundlePrice, sum);
  const buyer = buyers.find((b) => b.username === buyerUsername);

  const filtered = items.filter((i) =>
    query ? `${i.name} ${i.sku}`.toLowerCase().includes(query.toLowerCase()) : true,
  );

  function toggle(sku: string, available: boolean) {
    if (!available) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px]">
      <div className="border-b border-border p-8 lg:border-b-0 lg:border-r">
        <h1 className="mb-1 text-[24px] font-semibold text-ink">New bundle</h1>
        <p className="mb-5 text-[12px] text-muted">
          Curate a suggested lot for one client — live from Firestore inventory. They see it on their storefront.
        </p>

        <label className="mb-4 block">
          <div className="mb-1.5 micro-badge text-[10px] tracking-[0.14em] text-accent">CLIENT</div>
          <select
            value={buyerUsername}
            onChange={(e) => setBuyerUsername(e.target.value)}
            className="h-10 w-full rounded-chip border border-border bg-ground px-3.5 text-[13px] text-ink outline-none focus:border-accent"
          >
            {buyers.length === 0 ? <option value="">No portal clients yet</option> : null}
            {buyers.map((b) => (
              <option key={b.username} value={b.username}>
                {b.displayName || b.username}
                {b.company ? ` · ${b.company}` : ""} ({b.username})
              </option>
            ))}
          </select>
        </label>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="⌕  Search inventory…"
          className="mb-4 h-9 w-full rounded-chip border border-border bg-ground px-3.5 text-[12.5px] text-ink outline-none focus:border-accent"
        />

        <div className="grid grid-cols-[32px_48px_1fr_100px_80px] border-b border-ink/20 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          <span />
          <span />
          <span>Piece</span>
          <span className="text-right">Wholesale</span>
          <span className="text-center">Status</span>
        </div>

        <div className="max-h-[420px] overflow-auto">
          {filtered.map((it) => {
            const on = selected.has(it.sku);
            return (
              <button
                key={it.sku}
                type="button"
                onClick={() => toggle(it.sku, it.available)}
                className={clsx(
                  "grid w-full grid-cols-[32px_48px_1fr_100px_80px] items-center border-b border-border/60 py-2.5 text-left text-[12.5px] transition",
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
                <Placeholder imageSrc={it.imageUrl} className="h-10 w-10 rounded" />
                <span className="text-ink">
                  {it.name}{" "}
                  <span className="font-mono text-[10.5px] text-muted">{it.sku}</span>
                </span>
                <span className="text-right font-mono">{money(it.wholesalePrice)}</span>
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

        <form action={saveSuggestedLotAction} className="mt-6">
          <input type="hidden" name="buyerUsername" value={buyerUsername} />
          <input type="hidden" name="buyerDisplayName" value={buyer?.displayName || buyerUsername} />
          <input type="hidden" name="lotPrice" value={bundlePrice} />
          {chosen.map((c) => (
            <span key={c.sku}>
              <input type="hidden" name="skus" value={c.sku} />
              <input type="hidden" name="titles" value={c.name} />
              <input type="hidden" name="brands" value={c.brand || ""} />
              <input type="hidden" name="imageUrls" value={c.imageUrl || ""} />
            </span>
          ))}

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

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={chosen.length === 0 || !buyerUsername}
              className="h-11 rounded-chip bg-ink px-8 text-[11.5px] uppercase tracking-[0.14em] text-ground disabled:opacity-40"
            >
              Publish to client
            </button>
            <span className="text-[11.5px] text-muted">
              Saves as a suggested lot · lot price {money(bundlePrice)}
            </span>
          </div>
        </form>
      </div>

      <div className="bg-[#EFECE2] p-8">
        <div className="mb-4 flex items-center gap-2 micro-badge text-[10px] tracking-[0.14em] text-muted">
          <span className="h-[7px] w-[7px] rounded-full bg-success" />
          LIVE PREVIEW — AS THIS CLIENT WILL SEE IT
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
          {buyerUsername ? (
            <div className="mt-1 font-mono text-[11px] text-[#8B897F]">for @{buyerUsername}</div>
          ) : null}
          <div className="mt-3 flex gap-2">
            {chosen.length === 0 ? (
              <div className="flex h-[72px] w-full items-center justify-center rounded border border-white/10 font-mono text-[10px] text-white/40">
                select pieces to preview
              </div>
            ) : (
              chosen.slice(0, 5).map((c, i) => (
                <Placeholder
                  key={c.sku}
                  variant="dark"
                  imageSrc={c.imageUrl}
                  label={i === 4 && chosen.length > 5 ? `+${chosen.length - 4}` : c.sku}
                  className="h-[72px] w-[72px] items-end rounded border border-white/10 pb-1 text-[8px]"
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
            <div className="self-end micro-badge text-[9.5px] tracking-[0.12em] text-accent">
              SAVE {savePct}% · {money(saveAmt)}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 rounded-card border border-border bg-ground p-5 text-[12px] text-[#3A3934]">
          <Row k="Pieces selected" v={String(chosen.length)} />
          <Row k="Sum of wholesale" v={money(sum)} />
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
            k="Margin after discount"
            v={`${margin}% ${margin >= 30 ? "✓" : "⚠"}`}
            good={margin >= 30}
          />
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, danger, good }: { k: string; v: string; danger?: boolean; good?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span
        className="font-mono"
        style={{ color: danger ? "#A65440" : good ? "#4E9A6A" : "#16161A" }}
      >
        {v}
      </span>
    </div>
  );
}
