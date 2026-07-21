"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { money, fullDate } from "@/lib/format";
import { isoDate } from "@/lib/csv";
import { InvoiceBadge, MicroBadge } from "@/components/badges";
import type { StaffPerformanceRow, DateRangePreset } from "@/lib/performance";

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

export type RecentInvoiceRow = {
  id: string;
  reference: string;
  customerName: string;
  total: number;
  status: string;
  createdAt: string | null;
};

export type RecentOrderRow = {
  id: string;
  customerName: string;
  itemCount: number;
  total: number;
  status: string;
  createdAt: string | null;
  invoiced: boolean;
};

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v}%`;
}
function fmtMoneyOrDash(v: number | null): string {
  return v == null ? "—" : money(Math.round(v));
}

export function StaffPerformanceDetail({
  row,
  dailySales,
  preset,
  from,
  to,
  recentInvoices,
  recentOrders,
}: {
  row: StaffPerformanceRow;
  dailySales: { date: string; total: number }[];
  preset: DateRangePreset;
  from: string;
  to: string;
  recentInvoices: RecentInvoiceRow[];
  recentOrders: RecentOrderRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [customFrom, setCustomFrom] = useState(isoDate(from));
  const [customTo, setCustomTo] = useState(isoDate(to));

  function goTo(next: Record<string, string>) {
    const sp = new URLSearchParams(next);
    router.push(`${pathname}?${sp.toString()}`);
  }

  const maxDaily = Math.max(1, ...dailySales.map((d) => d.total));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => {
              if (p.value === "custom") return;
              goTo({ preset: p.value });
            }}
            className={
              "rounded-chip px-3 py-1.5 text-[11.5px] tracking-[0.06em] " +
              (preset === p.value
                ? "bg-ink text-ground"
                : "border border-border text-secondary hover:border-accent")
            }
          >
            {p.label}
          </button>
        ))}
        {preset === "custom" ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 rounded-chip border border-border bg-surface px-2 text-[12px] text-ink outline-none focus:border-accent"
            />
            <span className="text-[12px] text-muted">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 rounded-chip border border-border bg-surface px-2 text-[12px] text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => goTo({ preset: "custom", from: customFrom, to: customTo })}
              disabled={!customFrom || !customTo}
              className="h-9 rounded-chip bg-ink px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ground disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        ) : null}
        <span className="text-[11.5px] text-muted">
          {isoDate(from)} – {isoDate(to)}
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[9.5px] tracking-[0.14em] text-muted">SALES</div>
          <div className="mt-1 text-[21px] font-semibold text-ink">{money(Math.round(row.sales))}</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[9.5px] tracking-[0.14em] text-muted">INVOICES</div>
          <div className="mt-1 text-[21px] font-semibold text-ink">{row.invoices}</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[9.5px] tracking-[0.14em] text-muted">AOV</div>
          <div className="mt-1 text-[21px] font-semibold text-ink">{fmtMoneyOrDash(row.aov)}</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[9.5px] tracking-[0.14em] text-muted">CONVERSION</div>
          <div className="mt-1 text-[21px] font-semibold text-ink">{fmtPct(row.conversionPct)}</div>
          <div className="mt-1 text-[11px] text-muted">
            {row.quotesInvoiced} of {row.quotesClaimed} claimed
          </div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[9.5px] tracking-[0.14em] text-muted">CALLS</div>
          <div className="mt-1 text-[21px] font-semibold text-ink">{row.calls}</div>
        </div>
      </div>

      <div className="mb-6 rounded-card border border-border bg-surface p-5">
        <div className="micro-badge mb-4 text-[10px] tracking-[0.14em] text-accent">SALES OVER TIME</div>
        {dailySales.length === 0 || maxDaily <= 0 ? (
          <p className="text-[12px] text-muted">No invoices in this range.</p>
        ) : (
          <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="h-[100px] w-full">
            <polyline
              fill="none"
              stroke="#B08D3E"
              strokeWidth="2"
              points={dailySales
                .map((d, i) => {
                  const x = dailySales.length > 1 ? (i / (dailySales.length - 1)) * 300 : 0;
                  const y = 96 - (d.total / maxDaily) * 92;
                  return `${x},${y}`;
                })
                .join(" ")}
            />
          </svg>
        )}
        <div className="mt-2 flex justify-between text-[10px] text-muted">
          <span>{dailySales[0]?.date || ""}</span>
          <span>{dailySales[dailySales.length - 1]?.date || ""}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
            RECENT INVOICES
          </div>
          {recentInvoices.length === 0 ? (
            <p className="text-[12.5px] text-muted">No invoices created in this range.</p>
          ) : (
            <div className="space-y-2">
              {recentInvoices.map((inv) => (
                <a
                  key={inv.id}
                  href={`/wholesaleportal/rep/invoices/${inv.id}`}
                  className="flex items-center justify-between gap-3 rounded-chip border border-border/60 px-3 py-2.5 text-[12.5px] transition hover:border-accent hover:bg-ground/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">{inv.customerName || "—"}</div>
                    <div className="font-mono text-[10.5px] text-muted">
                      {inv.reference} · {fullDate(inv.createdAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono">{money(Math.round(inv.total))}</span>
                    <InvoiceBadge status={inv.status} />
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-card border border-border bg-surface p-5">
          <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
            RECENT ORDER REQUESTS CLAIMED
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-[12.5px] text-muted">No order requests claimed in this range.</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((q) => (
                <a
                  key={q.id}
                  href={`/wholesaleportal/rep/quotes/${q.id}`}
                  className="flex items-center justify-between gap-3 rounded-chip border border-border/60 px-3 py-2.5 text-[12.5px] transition hover:border-accent hover:bg-ground/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">{q.customerName || "—"}</div>
                    <div className="font-mono text-[10.5px] text-muted">
                      {q.itemCount} item{q.itemCount === 1 ? "" : "s"} · {fullDate(q.createdAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono">{money(Math.round(q.total))}</span>
                    <MicroBadge tone={q.invoiced ? "solid-green" : "outline-gray"}>
                      {q.invoiced ? "INVOICED" : q.status.toUpperCase()}
                    </MicroBadge>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
