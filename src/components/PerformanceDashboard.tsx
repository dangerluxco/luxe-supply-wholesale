"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { money } from "@/lib/format";
import { csvBody, isoDate } from "@/lib/csv";
import type { StaffPerformanceRow, TeamSummary, DateRangePreset } from "@/lib/performance";
import type { SalesGoals } from "@/lib/firestore/settings";

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

type SortField =
  | "name"
  | "sales"
  | "paidSales"
  | "pendingSales"
  | "marginDollars"
  | "units"
  | "invoices"
  | "aov"
  | "conversionPct"
  | "calls";

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v}%`;
}

function fmtMoneyOrDash(v: number | null): string {
  return v == null ? "—" : money(Math.round(v));
}

export function PerformanceDashboard({
  rows,
  team,
  dailySales,
  dailyMargin = [],
  goals = null,
  preset,
  from,
  to,
  staffIdByEmail,
}: {
  rows: StaffPerformanceRow[];
  team: TeamSummary;
  dailySales: { date: string; total: number }[];
  dailyMargin?: { date: string; total: number }[];
  goals?: SalesGoals | null;
  preset: DateRangePreset;
  from: string;
  to: string;
  staffIdByEmail?: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sortField, setSortField] = useState<SortField>("sales");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [customFrom, setCustomFrom] = useState(isoDate(from));
  const [customTo, setCustomTo] = useState(isoDate(to));

  function goTo(next: Record<string, string>) {
    const sp = new URLSearchParams(next);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  }

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortField === "name") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * dir;
      const av = a[sortField] ?? -Infinity;
      const bv = b[sortField] ?? -Infinity;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [rows, sortField, sortDir]);

  const maxSale = Math.max(1, ...rows.map((r) => r.sales));
  const maxDaily = Math.max(1, ...dailySales.map((d) => d.total));

  function sortIndicator(field: SortField) {
    if (sortField !== field) return null;
    return <span className="ml-1 text-accent">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function exportCsv() {
    const header = [
      "Name",
      "Email",
      "Sales",
      "Paid sales",
      "Pending sales",
      "Margin $",
      "Margin %",
      "Units",
      "Invoices",
      "AOV",
      "Conversion %",
      "Calls",
    ];
    const body = sortedRows.map((r) => [
      r.name,
      r.email,
      Math.round(r.sales),
      Math.round(r.paidSales),
      Math.round(r.pendingSales),
      Math.round(r.marginDollars),
      r.marginPct ?? "",
      r.units,
      r.invoices,
      r.aov != null ? Math.round(r.aov) : "",
      r.conversionPct ?? "",
      r.calls,
    ]);
    const csv = csvBody([header, ...body]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance_${isoDate(from)}_to_${isoDate(to)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Date range picker */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => {
              if (p.value === "custom") return; // handled by the apply button below
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
        <div className="flex-1" />
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="h-9 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {/* Team summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-muted">TOTAL SALES (PAID)</div>
          <div className="mt-1 text-[22px] font-semibold text-ink">
            {money(Math.round(team.totalPaidSales))}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">{money(Math.round(team.totalSales))} invoiced</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-muted">PENDING SALES</div>
          <div className="mt-1 text-[22px] font-semibold text-ink">
            {money(Math.round(team.totalPendingSales))}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">unpaid invoices</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-muted">GROSS MARGIN</div>
          <div className="mt-1 text-[22px] font-semibold text-ink">
            {money(Math.round(team.totalMarginDollars))}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {team.totalMarginPct != null ? `${team.totalMarginPct}% of costed sales` : "no cost data in range"}
          </div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-muted">UNITS SOLD</div>
          <div className="mt-1 text-[22px] font-semibold text-ink">{team.totalUnits}</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-muted">TOTAL INVOICES</div>
          <div className="mt-1 text-[22px] font-semibold text-ink">{team.totalInvoices}</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-muted">AVG AOV</div>
          <div className="mt-1 text-[22px] font-semibold text-ink">{fmtMoneyOrDash(team.avgAov)}</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-muted">TOTAL CALLS</div>
          <div className="mt-1 text-[22px] font-semibold text-ink">{team.totalCalls}</div>
        </div>
      </div>

      {/* Goal progress — monthly targets on the month view, weekly (if set) on the week view */}
      {(() => {
        if (!goals) return null;
        const targets =
          preset === "month"
            ? { label: "MONTHLY GOAL", revenue: goals.monthlyRevenue, gp: goals.monthlyGp }
            : preset === "week" && (goals.weeklyRevenue || goals.weeklyGp)
              ? { label: "WEEKLY GOAL", revenue: goals.weeklyRevenue || 0, gp: goals.weeklyGp || 0 }
              : null;
        if (!targets || (!targets.revenue && !targets.gp)) return null;
        const bars = [
          targets.revenue
            ? { name: "Revenue", actual: team.totalSales, target: targets.revenue }
            : null,
          targets.gp
            ? { name: "Gross profit", actual: team.totalMarginDollars, target: targets.gp }
            : null,
        ].filter(Boolean) as Array<{ name: string; actual: number; target: number }>;
        return (
          <div className="mb-6 rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-4 text-[10px] tracking-[0.14em] text-accent">
              {targets.label}
            </div>
            <div className="space-y-3">
              {bars.map((b) => {
                const pct = Math.min(100, Math.round((b.actual / b.target) * 100));
                const hit = b.actual >= b.target;
                return (
                  <div key={b.name}>
                    <div className="mb-1 flex items-baseline justify-between text-[12px]">
                      <span className="text-secondary">{b.name}</span>
                      <span className="font-mono text-ink">
                        {money(Math.round(b.actual))}{" "}
                        <span className="text-muted">/ {money(b.target)}</span>
                        <span className={"ml-2 font-semibold " + (hit ? "text-[#4E9A6A]" : "text-muted")}>
                          {pct}%
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-chip bg-ground">
                      <div
                        className={"h-full rounded-chip " + (hit ? "bg-[#4E9A6A]" : "bg-accent")}
                        style={{ width: `${Math.max(1, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Charts */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="micro-badge mb-4 text-[10px] tracking-[0.14em] text-accent">SALES BY STAFF</div>
          {rows.length === 0 ? (
            <p className="text-[12px] text-muted">No data in this range.</p>
          ) : (
            <div className="space-y-2.5">
              {sortedRows
                .slice()
                .sort((a, b) => b.sales - a.sales)
                .slice(0, 8)
                .map((r) => (
                  <div key={r.email} className="flex items-center gap-2">
                    <span className="w-[110px] shrink-0 truncate text-[11.5px] text-secondary">{r.name}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded-chip bg-ground">
                      <div
                        className="h-full rounded-chip bg-accent"
                        style={{ width: `${Math.max(2, (r.sales / maxSale) * 100)}%` }}
                      />
                    </div>
                    <span className="w-[70px] shrink-0 text-right font-mono text-[11px] text-muted">
                      {money(Math.round(r.sales))}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="rounded-card border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
              SALES &amp; MARGIN OVER TIME
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted">
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-4 bg-[#B08D3E]" /> Sales
              </span>
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-4 bg-[#4E9A6A]" /> Margin
              </span>
            </div>
          </div>
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
              {dailyMargin.length > 0 && dailyMargin.some((d) => d.total !== 0) ? (
                <polyline
                  fill="none"
                  stroke="#4E9A6A"
                  strokeWidth="2"
                  points={dailyMargin
                    .map((d, i) => {
                      const x = dailyMargin.length > 1 ? (i / (dailyMargin.length - 1)) * 300 : 0;
                      const y = 96 - (Math.max(0, d.total) / maxDaily) * 92;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
              ) : null}
            </svg>
          )}
          <div className="mt-2 flex justify-between text-[10px] text-muted">
            <span>{dailySales[0]?.date || ""}</span>
            <span>{dailySales[dailySales.length - 1]?.date || ""}</span>
          </div>
        </div>
      </div>

      {/* Per-staff table */}
      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-border px-5 py-10 text-center text-[12.5px] text-muted">
          No staff activity in this range.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <div className="min-w-[880px]">
            <div className="grid grid-cols-[1.2fr_95px_95px_110px_60px_75px_90px_95px_60px] items-center gap-x-2 border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              <button type="button" onClick={() => toggleSort("name")} className="flex items-center text-left hover:text-ink">
                Name {sortIndicator("name")}
              </button>
              <button type="button" onClick={() => toggleSort("paidSales")} className="flex items-center justify-end hover:text-ink">
                Paid {sortIndicator("paidSales")}
              </button>
              <button type="button" onClick={() => toggleSort("pendingSales")} className="flex items-center justify-end hover:text-ink">
                Pending {sortIndicator("pendingSales")}
              </button>
              <button type="button" onClick={() => toggleSort("marginDollars")} className="flex items-center justify-end hover:text-ink">
                Margin {sortIndicator("marginDollars")}
              </button>
              <button type="button" onClick={() => toggleSort("units")} className="flex items-center justify-end hover:text-ink">
                Units {sortIndicator("units")}
              </button>
              <button type="button" onClick={() => toggleSort("invoices")} className="flex items-center justify-end hover:text-ink">
                Invoices {sortIndicator("invoices")}
              </button>
              <button type="button" onClick={() => toggleSort("aov")} className="flex items-center justify-end hover:text-ink">
                AOV {sortIndicator("aov")}
              </button>
              <button type="button" onClick={() => toggleSort("conversionPct")} className="flex items-center justify-end hover:text-ink">
                Conv. {sortIndicator("conversionPct")}
              </button>
              <button type="button" onClick={() => toggleSort("calls")} className="flex items-center justify-end hover:text-ink">
                Calls {sortIndicator("calls")}
              </button>
            </div>
            {sortedRows.map((r) => (
              <div
                key={r.email}
                className="grid grid-cols-[1.2fr_95px_95px_110px_60px_75px_90px_95px_60px] items-center gap-x-2 border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] last:border-b-0"
              >
                <div className="min-w-0">
                  {staffIdByEmail?.[r.email] ? (
                    <a
                      href={`/wholesaleportal/rep/staff/${staffIdByEmail[r.email]}`}
                      className="block truncate font-semibold text-ink hover:text-accent hover:underline"
                    >
                      {r.name}
                    </a>
                  ) : (
                    <div className="truncate font-semibold text-ink">{r.name}</div>
                  )}
                  <div className="truncate font-mono text-[10.5px] text-muted">{r.email}</div>
                </div>
                <div className="text-right font-mono font-semibold text-ink">
                  {money(Math.round(r.paidSales))}
                </div>
                <div className="text-right font-mono">{money(Math.round(r.pendingSales))}</div>
                <div className="text-right font-mono">
                  {money(Math.round(r.marginDollars))}
                  <span className="ml-1 text-[10px] text-muted">
                    {r.marginPct != null ? `${r.marginPct}%` : "—"}
                  </span>
                </div>
                <div className="text-right font-mono">{r.units}</div>
                <div className="text-right font-mono">{r.invoices}</div>
                <div className="text-right font-mono">{fmtMoneyOrDash(r.aov)}</div>
                <div className="text-right font-mono">{fmtPct(r.conversionPct)}</div>
                <div className="text-right font-mono">{r.calls}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
