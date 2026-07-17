"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { Placeholder } from "@/components/Placeholder";
import { ProductGallery, type GalleryItem } from "@/components/ProductGallery";
import { money } from "@/lib/format";
import { portalDisplayTitle, portalShowSkuLine } from "@/components/PortalItemLine";
import { clsx } from "@/lib/clsx";

type Decision = "" | "approve" | "maybe" | "decline";

type CurationItem = {
  sku: string;
  title: string;
  brand: string;
  condition: string;
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
  revision: number;
  expiresAt: string | null;
};

const STATUS_OPTIONS: Array<{ value: "all" | Decision; label: string }> = [
  { value: "all", label: "All items" },
  { value: "approve", label: "Approved" },
  { value: "maybe", label: "Maybe" },
  { value: "decline", label: "Declined" },
  { value: "", label: "Pending" },
];

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

function expiresLabel(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `Expires in ${h}h ${m}m` : `Expires in ${m}m`;
}

export function CurationViewer({ token }: { token: string }) {
  const [share, setShare] = useState<CurationShare | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | Decision>("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [gallery, setGallery] = useState<{ item: GalleryItem; index: number } | null>(null);
  const [dismissedHero, setDismissedHero] = useState<string | null>(null);
  const pendingSkus = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/curation/${token}`, { credentials: "same-origin" });
        if (cancelled) return;
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { share?: CurationShare };
        if (!data.share) {
          setNotFound(true);
          return;
        }
        setShare((prev) => {
          if (!prev) return data.share!;
          if (data.share!.revision < prev.revision) return prev;
          return {
            ...data.share!,
            items: data.share!.items.map((incoming) => {
              if (!pendingSkus.current.has(incoming.sku)) return incoming;
              const local = prev.items.find((it) => it.sku === incoming.sku);
              return local
                ? { ...incoming, decision: local.decision, note: local.note }
                : incoming;
            }),
          };
        });
      } catch {
        /* ignore transient poll failures */
      }
    }

    load();
    const id = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  const brands = useMemo(() => {
    if (!share) return [];
    return [...new Set(share.items.map((it) => it.brand).filter(Boolean))].sort();
  }, [share]);

  const filteredItems = useMemo(() => {
    if (!share) return [];
    return share.items.filter((it) => {
      if (statusFilter !== "all" && it.decision !== statusFilter) return false;
      if (brandFilter !== "all" && it.brand !== brandFilter) return false;
      return true;
    });
  }, [share, statusFilter, brandFilter]);

  const counts = useMemo(() => {
    if (!share) return { approve: 0, maybe: 0, decline: 0, pending: 0, cartTotal: 0 };
    return share.items.reduce(
      (acc, it) => {
        if (it.decision === "approve") {
          acc.approve += 1;
          acc.cartTotal += it.price;
        } else if (it.decision === "maybe") acc.maybe += 1;
        else if (it.decision === "decline") acc.decline += 1;
        else acc.pending += 1;
        return acc;
      },
      { approve: 0, maybe: 0, decline: 0, pending: 0, cartTotal: 0 },
    );
  }, [share]);

  const heroItem =
    share && share.heroSku && share.heroSku !== dismissedHero
      ? share.items.find((it) => it.sku === share.heroSku) || null
      : null;

  function setDecision(sku: string, decision: Decision) {
    if (!share) return;
    setShare((prev) =>
      prev
        ? { ...prev, items: prev.items.map((it) => (it.sku === sku ? { ...it, decision } : it)) }
        : prev,
    );
    pendingSkus.current.add(sku);
    fetch(`/api/curation/${token}/decision`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, decision }),
    })
      .catch(() => {})
      .finally(() => pendingSkus.current.delete(sku));
  }

  function toggleDecision(sku: string, decision: Exclude<Decision, "">) {
    const current = share?.items.find((it) => it.sku === sku)?.decision;
    setDecision(sku, current === decision ? "" : decision);
    if (share?.heroSku === sku) setDismissedHero(sku);
  }

  function saveNote(sku: string, note: string) {
    setShare((prev) =>
      prev
        ? { ...prev, items: prev.items.map((it) => (it.sku === sku ? { ...it, note } : it)) }
        : prev,
    );
    pendingSkus.current.add(sku);
    fetch(`/api/curation/${token}/note`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, note }),
    })
      .catch(() => {})
      .finally(() => pendingSkus.current.delete(sku));
  }

  function openGallery(it: CurationItem) {
    const urls = it.imageUrls.length ? it.imageUrls : it.imageUrl ? [it.imageUrl] : [];
    if (!urls.length) return;
    setGallery({ item: { title: portalDisplayTitle(it.title, it.sku), sku: it.sku, imageUrls: urls }, index: 0 });
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground px-6">
        <div className="max-w-sm rounded-card border border-border bg-surface p-8 text-center">
          <Logo />
          <h1 className="mt-6 text-[18px] font-semibold text-ink">This link is unavailable</h1>
          <p className="mt-2 text-[12.5px] text-secondary">
            It may have expired, been revoked, or the URL is incorrect. Ask your rep for a new
            link.
          </p>
        </div>
      </div>
    );
  }

  if (!share) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-muted">
        Loading…
      </div>
    );
  }

  function DecisionButtons({ it }: { it: CurationItem }) {
    return (
      <div className="flex gap-1.5">
        {(["approve", "maybe", "decline"] as const).map((d) => {
          const meta = DECISION_META[d];
          const active = it.decision === d;
          return (
            <button
              key={d}
              type="button"
              disabled={share!.sessionEnded}
              onClick={() => toggleDecision(it.sku, d)}
              className={clsx(
                "h-8 flex-1 rounded-chip border text-[10.5px] font-semibold uppercase tracking-[0.08em] transition disabled:opacity-50",
                active ? meta.activeClass : meta.idleClass,
              )}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground pb-28">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-6 py-3 backdrop-blur">
        <Logo />
        {share.expiresAt && !share.sessionEnded ? (
          <span className="font-mono text-[11px] text-muted">{expiresLabel(share.expiresAt)}</span>
        ) : null}
      </header>

      <div className="mx-auto max-w-5xl px-6 pt-6">
        <h1 className="text-[22px] font-semibold text-ink">
          {share.clientName ? `Curated for ${share.clientName}` : "Your curated selection"}
        </h1>
        <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-muted">
          {share.invoiceDate ? <span>{share.invoiceDate}</span> : null}
          <span>
            {share.itemCount} item{share.itemCount === 1 ? "" : "s"}
          </span>
          <a
            href={`/api/curation/${token}/export`}
            className="text-accent underline decoration-accent/40 hover:decoration-accent"
          >
            Export approved CSV
          </a>
        </div>
        {share.note ? <p className="mt-3 text-[12.5px] text-secondary">{share.note}</p> : null}
        {share.sessionEnded ? (
          <div className="mt-4 rounded-chip border border-border bg-surface px-4 py-3 text-[12.5px] text-secondary">
            This session has ended — your selections are saved and visible below, read-only.
          </div>
        ) : null}

        {heroItem ? (
          <div className="mt-6 overflow-hidden rounded-card border border-accent/40 bg-surface">
            <div className="micro-badge border-b border-accent/30 bg-accent/10 px-4 py-2 text-[10px] tracking-[0.14em] text-accent">
              NOW VIEWING
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1.15fr_1fr]">
              <button
                type="button"
                onClick={() => openGallery(heroItem)}
                className="relative block aspect-square w-full overflow-hidden bg-ground sm:max-h-[520px]"
              >
                <Placeholder
                  imageSrc={heroItem.imageUrl}
                  alt={portalDisplayTitle(heroItem.title, heroItem.sku)}
                  className="h-full w-full"
                />
              </button>
              <div className="flex min-w-0 flex-col gap-3 p-5 sm:p-7">
                <div>
                  <div className="text-[20px] font-semibold text-ink sm:text-[26px]">
                    {portalDisplayTitle(heroItem.title, heroItem.sku)}
                  </div>
                  {heroItem.brand ? (
                    <div className="mt-1 text-[13px] text-secondary">{heroItem.brand}</div>
                  ) : null}
                  <div className="mt-3 font-mono text-[26px] text-ink sm:text-[32px]">
                    {money(Math.round(heroItem.price))}
                  </div>
                </div>
                <DecisionButtons it={heroItem} />
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Invoice notes
                  </span>
                  <textarea
                    key={heroItem.sku}
                    defaultValue={heroItem.note}
                    disabled={share.sessionEnded}
                    onBlur={(e) => saveNote(heroItem.sku, e.target.value)}
                    placeholder="Account, callouts…"
                    rows={2}
                    maxLength={500}
                    className="min-h-[2.6rem] w-full resize-y rounded-chip border border-border bg-ground px-2.5 py-1.5 text-[12px] leading-snug text-ink outline-none focus:border-accent disabled:opacity-60"
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | Decision)}
            className="h-9 rounded-chip border border-border bg-surface px-3 text-[12px] text-ink outline-none focus:border-accent"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {brands.length > 1 ? (
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="h-9 rounded-chip border border-border bg-surface px-3 text-[12px] text-ink outline-none focus:border-accent"
            >
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((it) => (
            <div
              key={it.sku}
              className="overflow-hidden rounded-card border border-border bg-surface"
            >
              <button type="button" onClick={() => openGallery(it)} className="block w-full">
                <div className="aspect-[4/3] bg-ground">
                  <Placeholder
                    imageSrc={it.imageUrl}
                    alt={portalDisplayTitle(it.title, it.sku)}
                    className="h-full w-full"
                  />
                </div>
              </button>
              <div className="space-y-2 p-3.5">
                <div>
                  <div className="truncate text-[13px] font-semibold text-ink">
                    {portalDisplayTitle(it.title, it.sku)}
                  </div>
                  {portalShowSkuLine(it.title, it.sku) ? (
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                      {it.sku}
                    </div>
                  ) : null}
                  {it.brand ? <div className="text-[11px] text-secondary">{it.brand}</div> : null}
                </div>
                <div className="font-mono text-[14px] text-ink">{money(Math.round(it.price))}</div>
                <DecisionButtons it={it} />
                <label className="flex flex-col gap-1">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Invoice notes
                  </span>
                  <textarea
                    defaultValue={it.note}
                    disabled={share.sessionEnded}
                    onBlur={(e) => saveNote(it.sku, e.target.value)}
                    placeholder="Account, callouts…"
                    rows={2}
                    maxLength={500}
                    className="min-h-[2.6rem] w-full resize-y rounded-chip border border-border bg-ground px-2.5 py-1.5 text-[11.5px] leading-snug text-ink outline-none focus:border-accent disabled:opacity-60"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        {filteredItems.length === 0 ? (
          <div className="mt-6 rounded-chip border border-border px-4 py-8 text-center text-[12.5px] text-muted">
            No items match this filter.
          </div>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-[12.5px]">
          <span className="font-mono text-secondary">
            ✓{counts.approve} approved · ~{counts.maybe} maybe · ✕{counts.decline} declined ·{" "}
            {counts.pending} pending
          </span>
          <span className="font-mono text-[15px] text-ink">
            {money(Math.round(counts.cartTotal))} approved
          </span>
        </div>
      </div>

      {gallery ? (
        <ProductGallery
          item={gallery.item}
          index={gallery.index}
          onIndexChange={(index) => setGallery((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setGallery(null)}
        />
      ) : null}
    </div>
  );
}
