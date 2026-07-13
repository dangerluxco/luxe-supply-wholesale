"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { clsx } from "@/lib/clsx";
import { MicroBadge } from "./badges";

export type RepStat = {
  id: string;
  name: string;
  initials: string;
  title: string;
  isSenior: boolean;
  isNew: boolean;
  sales: number;
  invoices: number;
  aov: number;
  conversion: number;
  calls: number;
  deltaSales: number;
  monthly: number[];
};

const MONTH_LABELS = ["AUG", "OCT", "DEC", "FEB", "APR", "JUN"];

export function Performance({ reps, teamConversion }: { reps: RepStat[]; teamConversion: number }) {
  const sorted = [...reps].sort((a, b) => b.sales - a.sales);
  const maxSales = Math.max(...sorted.map((r) => r.sales), 1);
  const [selectedId, setSelectedId] = useState(sorted[0]?.id);
  const sel = sorted.find((r) => r.id === selectedId) ?? sorted[0];
  const maxMonthly = sel ? Math.max(...sel.monthly, 1) : 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px]">
      {/* leaderboard */}
      <div className="border-b border-border p-8 lg:border-b-0 lg:border-r">
        <h1 className="mb-5 text-[24px] font-semibold text-ink">Leaderboard</h1>
        <div className="grid grid-cols-[28px_1.3fr_90px_70px_80px_64px_56px] border-b border-ink/20 pb-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          <span>#</span>
          <span>Rep</span>
          <span className="text-right">Sales</span>
          <span className="text-right">Inv.</span>
          <span className="text-right">AOV</span>
          <span className="text-right">Conv.</span>
          <span className="text-right">Calls</span>
        </div>
        {sorted.map((r, i) => {
          const on = r.id === sel?.id;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={clsx(
                "grid w-full grid-cols-[28px_1.3fr_90px_70px_80px_64px_56px] items-center border-b border-border/60 py-3.5 text-left text-[12.5px] text-[#3A3934] transition",
                on ? "bg-accent/5" : "hover:bg-ground",
              )}
            >
              <span className="font-mono text-[16px] text-accent">{i + 1}</span>
              <span>
                <span className="flex items-center gap-1.5">
                  <strong className="font-semibold">{r.name}</strong>
                  {r.isSenior ? <MicroBadge tone="outline-gold">SENIOR</MicroBadge> : null}
                  {r.isNew ? <MicroBadge tone="outline-gray">NEW</MicroBadge> : null}
                </span>
                <span className="mt-1.5 block h-1 max-w-[180px] rounded-full bg-ink/10">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(r.sales / maxSales) * 100}%`, background: "#B08D3E" }}
                  />
                </span>
              </span>
              <span className="text-right font-mono text-ink">${Math.round(r.sales / 1000)}k</span>
              <span className="text-right font-mono">{r.invoices}</span>
              <span className="text-right font-mono">{money(r.aov)}</span>
              <span
                className="text-right font-mono"
                style={{ color: r.conversion >= teamConversion ? "#4E9A6A" : "#B08D3E" }}
              >
                {r.conversion}%
              </span>
              <span className="text-right font-mono">{r.calls}</span>
            </button>
          );
        })}
        <p className="mt-4 text-[11px] text-muted">
          Conversion = invoices paid ÷ leads worked · Calls = live video viewings held
        </p>
      </div>

      {/* per-rep panel */}
      {sel ? (
        <div className="bg-ground p-8">
          <div className="mb-5 flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-ground">
              {sel.initials}
            </div>
            <div>
              <div className="text-[20px] font-semibold text-ink">{sel.name}</div>
              <div className="text-[11px] text-muted">{sel.title}</div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-2.5">
            <StatCard label="Quarter sales" value={money(sel.sales)} sub={`↑ ${sel.deltaSales}% vs. last Q`} good />
            <StatCard label="Avg order value" value={money(sel.aov)} sub="per invoice" />
            <StatCard
              label="Conversion"
              value={`${sel.conversion}%`}
              sub={`team avg ${teamConversion}%`}
              good={sel.conversion >= teamConversion}
            />
            <StatCard label="Video calls held" value={String(sel.calls)} sub="this quarter" />
          </div>

          <div className="mb-3 micro-badge text-[10px] tracking-[0.14em] text-accent">
            MONTHLY SALES · TRAILING 12
          </div>
          <div className="flex h-[130px] items-end gap-1.5 border-b border-ink/20">
            {sel.monthly.map((m, i) => {
              const h = Math.round((m / maxMonthly) * 100);
              const shade = i < 6 ? "#D8CDB2" : i < 9 ? "#C9B88C" : i < 11 ? "#B39A63" : "#B08D3E";
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-[2px]"
                  style={{ height: `${h}%`, background: shade }}
                  title={`${money(m * 1000)}`}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9.5px] text-muted">
            {MONTH_LABELS.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  good,
}: {
  label: string;
  value: string;
  sub: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="micro-badge text-[9.5px] tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-1 font-mono text-[22px] font-semibold text-ink">{value}</div>
      <div className="text-[10.5px]" style={{ color: good ? "#4E9A6A" : "#6B6A64" }}>
        {sub}
      </div>
    </div>
  );
}
