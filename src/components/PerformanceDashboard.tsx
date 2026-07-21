"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { money } from "@/lib/format";
import { csvBody, isoDate } from "@/lib/csv";
import type { StaffPerformanceRow, TeamSummary, DateRangePreset } from "@/lib/performance";

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

type SortField = "name" | "sales" | "invoices" | "aov" | "conversionPct" | "calls";

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
  preset,
  from,
  to,
  staffIdByEmail,
}: {
  rows: StaffPerformanceRow[];
  team: TeamSummary;
  dailySales: { date: string; total: number }[];
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
    const header = ["Name", "Email", "Sales", "Invoices", "AOV", "Conversion %", "Calls"];
    const body = sortedRows.map((r) => [
      r.name,
      r.email,
      Math.round(r.sales),
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
          <div className="micro-badge text-[10px] tracking-[0.14em] text-muted">TOTAL SALES</div>
          <div className="mt-1 text-[22px] font-semibold text-ink">{money(Math.round(team.totalSales))}</div>
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
      </div>

      {/* Per-staff table */}
      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-border px-5 py-10 text-center text-[12.5px] text-muted">
          No staff activity in this range.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[1.3fr_100px_90px_100px_110px_80px] items-center border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              <button type="button" onClick={() => toggleSort("name")} className="flex items-center text-left hover:text-ink">
                Name {sortIndicator("name")}
              </button>
              <button type="button" onClick={() => toggleSort("sales")} className="flex items-center justify-end hover:text-ink">
                Sales {sortIndicator("sales")}
              </button>
              <button type="button" onClick={() => toggleSort("invoices")} className="flex items-center justify-end hover:text-ink">
                Invoices {sortIndicator("invoices")}
              </button>
              <button type="button" onClick={() => toggleSort("aov")} className="flex items-center justify-end hover:text-ink">
                AOV {sortIndicator("aov")}
              </button>
              <button type="button" onClick={() => toggleSort("conversionPct")} className="flex items-center justify-end hover:text-ink">
                Conversion {sortIndicator("conversionPct")}
              </button>
              <button type="button" onClick={() => toggleSort("calls")} className="flex items-center justify-end hover:text-ink">
                Calls {sortIndicator("calls")}
              </button>
            </div>
            {sortedRows.map((r) => (
              <div
                key={r.email}
                className="grid grid-cols-[1.3fr_100px_90px_100px_110px_80px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] last:border-b-0"
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
                <div className="text-right font-mono font-semibold text-ink">{money(Math.round(r.sales))}</div>
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
