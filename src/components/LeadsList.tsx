"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { money } from "@/lib/format";
import type { Lead, LeadStatus } from "@/lib/firestore/leads";
import { CreateLeadModal } from "@/components/CreateLeadModal";

const PIPELINE: { value: LeadStatus | "all"; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualifying", label: "Qualifying" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "all", label: "All" },
];

const STATUS_COLOR: Record<string, string> = {
  new: "#3A7CA5",
  contacted: "#B08D3E",
  qualifying: "#8A6FBF",
  won: "#4E9A6A",
  lost: "#A65440",
};

export function LeadsList({
  initialLeads,
  initialStatus,
  currentStaffEmail,
}: {
  initialLeads: Lead[];
  initialStatus: LeadStatus | "all";
  currentStaffEmail: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [leads, setLeads] = useState(initialLeads);
  const [status, setStatus] = useState(initialStatus);
  const [repFilter, setRepFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [q, setQ] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ email: string; displayName: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    fetch("/api/staff/directory", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => setStaffOptions(Array.isArray(data.staff) ? data.staff : []))
      .catch(() => {});
  }, []);

  function goToStatus(next: LeadStatus | "all") {
    setStatus(next);
    router.push(`${pathname}?status=${next}`);
  }

  const filtered = useMemo(() => {
    let rows = leads;
    if (repFilter) {
      rows = rows.filter((l) => (l.assignedRepEmail || "").toLowerCase() === repFilter.toLowerCase());
    }
    if (fromDate) {
      rows = rows.filter((l) => !!l.createdAt && l.createdAt >= fromDate);
    }
    if (toDate) {
      rows = rows.filter((l) => !!l.createdAt && l.createdAt <= `${toDate}T23:59:59.999Z`);
    }
    const term = q.trim().toLowerCase();
    if (term) {
      rows = rows.filter((l) => `${l.company} ${l.contactName}`.toLowerCase().includes(term));
    }
    return rows;
  }, [leads, repFilter, fromDate, toDate, q]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {PIPELINE.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => goToStatus(p.value)}
            className={
              "rounded-chip px-3 py-1.5 text-[11px] tracking-[0.06em] " +
              (status === p.value
                ? "bg-ink text-ground"
                : "border border-border text-secondary hover:border-accent")
            }
          >
            {p.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground transition hover:opacity-90"
        >
          Create lead
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company or contact name…"
          className="h-9 min-w-[220px] flex-1 rounded-chip border border-border bg-surface px-3 text-[12.5px] text-ink outline-none focus:border-accent"
        />
        <select
          value={repFilter}
          onChange={(e) => setRepFilter(e.target.value)}
          className="h-9 rounded-chip border border-border bg-surface px-2.5 text-[12px] text-ink outline-none focus:border-accent"
        >
          <option value="">All reps</option>
          {staffOptions.map((s) => (
            <option key={s.email} value={s.email}>
              {s.displayName}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-9 rounded-chip border border-border bg-surface px-2 text-[12px] text-ink outline-none focus:border-accent"
        />
        <span className="text-[11px] text-muted">to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-9 rounded-chip border border-border bg-surface px-2 text-[12px] text-ink outline-none focus:border-accent"
        />
        {repFilter || fromDate || toDate || q ? (
          <button
            type="button"
            onClick={() => {
              setRepFilter("");
              setFromDate("");
              setToDate("");
              setQ("");
            }}
            className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-border px-5 py-10 text-center text-[12.5px] text-muted">
          No leads match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[1.2fr_1fr_110px_1fr_100px] items-center border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              <span>Company</span>
              <span>Contact</span>
              <span>Status</span>
              <span>Assigned rep</span>
              <span className="text-right">Est. spend</span>
            </div>
            {filtered.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => router.push(`/wholesaleportal/rep/leads/${l.id}`)}
                className="grid w-full grid-cols-[1.2fr_1fr_110px_1fr_100px] items-center border-b border-border/60 px-5 py-3.5 text-left text-[12.5px] text-[#3A3934] transition last:border-b-0 hover:bg-ground/70"
              >
                <div className="min-w-0 truncate font-semibold text-ink">{l.company}</div>
                <div className="min-w-0 truncate">{l.contactName || "—"}</div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: STATUS_COLOR[l.status] || "#8B897F" }}
                  />
                  {l.status}
                </div>
                <div className="min-w-0 truncate text-muted">{l.assignedRepName || "Unassigned"}</div>
                <div className="text-right font-mono">
                  {l.estAnnualSpend != null ? money(Math.round(l.estAnnualSpend)) : "—"}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showCreate ? (
        <CreateLeadModal
          currentStaffEmail={currentStaffEmail}
          staffOptions={staffOptions}
          onClose={() => setShowCreate(false)}
          onCreated={(lead) => {
            setShowCreate(false);
            router.push(`/wholesaleportal/rep/leads/${lead.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
