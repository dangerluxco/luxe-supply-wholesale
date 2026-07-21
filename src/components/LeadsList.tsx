"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { money, shortDate } from "@/lib/format";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  type Lead,
  type LeadStatus,
} from "@/lib/leads-shared";
import { CreateLeadModal } from "@/components/CreateLeadModal";
import { PressableButton } from "@/components/PressableButton";

const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "#3A7CA5",
  contacted: "#B08D3E",
  qualifying: "#8A6FBF",
  won: "#4E9A6A",
  lost: "#A65440",
};

type SortKey = "company" | "contactName" | "status" | "assignedRepName" | "estAnnualSpend" | "createdAt";
type ViewMode = "board" | "table";

export function LeadsList({
  initialLeads,
  currentStaffEmail,
}: {
  initialLeads: Lead[];
  currentStaffEmail: string;
}) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [view, setView] = useState<ViewMode>("board");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [repFilter, setRepFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [staffOptions, setStaffOptions] = useState<{ email: string; displayName: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [dragOverStatus, setDragOverStatus] = useState<LeadStatus | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    fetch("/api/staff/directory", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => setStaffOptions(Array.isArray(data.staff) ? data.staff : []))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let rows = leads;
    if (statusFilter !== "all") {
      rows = rows.filter((l) => l.status === statusFilter);
    }
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
      rows = rows.filter((l) =>
        `${l.company} ${l.contactName} ${l.email} ${l.industry}`.toLowerCase().includes(term),
      );
    }
    return rows;
  }, [leads, statusFilter, repFilter, fromDate, toDate, q]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (sortKey === "estAnnualSpend") {
        return ((av as number | null) ?? -1) < ((bv as number | null) ?? -1) ? -dir : dir;
      }
      return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { sensitivity: "base" }) * dir;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const boardColumns = useMemo(() => {
    // Board always shows every status column; status filter still applies to cards.
    return LEAD_STATUSES.map((status) => ({
      status,
      label: LEAD_STATUS_LABEL[status],
      cards: filtered.filter((l) => l.status === status),
    }));
  }, [filtered]);

  const filtersActive = statusFilter !== "all" || !!repFilter || !!fromDate || !!toDate || !!q;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "createdAt" || key === "estAnnualSpend" ? "desc" : "asc");
    }
  }

  function moveLeadStatus(leadId: string, status: LeadStatus) {
    const prev = leads;
    const current = prev.find((l) => l.id === leadId);
    if (!current || current.status === status) return;

    setError(null);
    setLeads((rows) => rows.map((l) => (l.id === leadId ? { ...l, status } : l)));
    start(async () => {
      const res = await fetch(`/api/staff/leads/${leadId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; lead?: Lead };
      if (!res.ok || data.error || !data.lead) {
        setLeads(prev);
        setError(data.error || "Could not update lead status.");
        return;
      }
      setLeads((rows) => rows.map((l) => (l.id === leadId ? data.lead! : l)));
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 rounded-chip border border-border p-0.5">
          {(["board", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={clsx(
                "no-press rounded-[6px] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition",
                view === v ? "bg-ink text-ground" : "text-muted hover:text-ink",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-muted">
          {filtered.length} of {leads.length}
          {pending ? " · saving…" : ""}
        </span>
        <div className="flex-1" />
        <PressableButton
          onClick={() => setShowCreate(true)}
          className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground"
        >
          Create lead
        </PressableButton>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-3 py-2.5">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company, contact, email…"
          className="h-9 min-w-[200px] flex-1 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}
          className="h-9 rounded-chip border border-border bg-ground px-2.5 text-[12px] text-ink outline-none focus:border-accent"
        >
          <option value="all">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={repFilter}
          onChange={(e) => setRepFilter(e.target.value)}
          className="h-9 rounded-chip border border-border bg-ground px-2.5 text-[12px] text-ink outline-none focus:border-accent"
        >
          <option value="">All owners</option>
          {staffOptions.map((s) => (
            <option key={s.email} value={s.email}>
              {s.displayName}
              {s.email === currentStaffEmail ? " (me)" : ""}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-9 rounded-chip border border-border bg-ground px-2 text-[12px] text-ink outline-none focus:border-accent"
          title="Created from"
        />
        <span className="text-[11px] text-muted">to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-9 rounded-chip border border-border bg-ground px-2 text-[12px] text-ink outline-none focus:border-accent"
          title="Created to"
        />
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setRepFilter("");
              setFromDate("");
              setToDate("");
              setQ("");
            }}
            className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-3 text-[12px] text-danger">{error}</p> : null}

      {view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {boardColumns.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStatus(col.status);
              }}
              onDragLeave={() => setDragOverStatus((s) => (s === col.status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStatus(null);
                const leadId = e.dataTransfer.getData("text/lead-id");
                if (leadId) moveLeadStatus(leadId, col.status);
              }}
              className={clsx(
                "flex w-[240px] shrink-0 flex-col rounded-card border bg-ground/40 p-3 transition",
                dragOverStatus === col.status ? "border-accent bg-accent/5" : "border-border/70",
              )}
            >
              <div className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_COLOR[col.status] }}
                  />
                  {col.label}
                </span>
                <span>{col.cards.length}</span>
              </div>
              <div className="min-h-[120px] space-y-2">
                {col.cards.length === 0 ? (
                  <div className="rounded-chip border border-dashed border-border/60 px-2.5 py-6 text-center text-[11px] text-muted">
                    Drop leads here
                  </div>
                ) : (
                  col.cards.map((l) => (
                    <article
                      key={l.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/lead-id", l.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => router.push(`/wholesaleportal/rep/leads/${l.id}`)}
                      className="cursor-grab rounded-chip border border-border bg-surface px-2.5 py-2.5 text-left transition hover:border-accent active:cursor-grabbing"
                    >
                      <div className="truncate text-[12.5px] font-semibold text-ink">{l.company}</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted">
                        {l.contactName || "No contact"}
                        {l.assignedRepName ? ` · ${l.assignedRepName}` : ""}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-ink">
                          {l.estAnnualSpend != null ? money(Math.round(l.estAnnualSpend)) : "—"}
                        </span>
                        <span className="font-mono text-[10px] text-muted">{shortDate(l.createdAt)}</span>
                      </div>
                      <select
                        value={l.status}
                        disabled={pending}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          moveLeadStatus(l.id, e.target.value as LeadStatus);
                        }}
                        className="no-press mt-2 h-7 w-full rounded-[4px] border border-border bg-ground px-1.5 text-[10px] uppercase tracking-[0.06em] text-muted outline-none focus:border-accent"
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {LEAD_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </article>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-border px-5 py-10 text-center text-[12.5px] text-muted">
          No leads match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[1.3fr_1fr_100px_1fr_100px_90px] items-center border-b border-border bg-ground/50 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              {(
                [
                  ["company", "Company"],
                  ["contactName", "Contact"],
                  ["status", "Status"],
                  ["assignedRepName", "Owner"],
                  ["estAnnualSpend", "Est. spend"],
                  ["createdAt", "Created"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSort(key)}
                  className={clsx(
                    "no-press text-left transition hover:text-ink",
                    key === "estAnnualSpend" || key === "createdAt" ? "text-right" : "",
                    sortKey === key ? "text-ink" : "",
                  )}
                >
                  {label}
                  {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              ))}
            </div>
            {sorted.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => router.push(`/wholesaleportal/rep/leads/${l.id}`)}
                className="grid w-full grid-cols-[1.3fr_1fr_100px_1fr_100px_90px] items-center border-b border-border/60 px-5 py-3.5 text-left text-[12.5px] text-[#3A3934] transition last:border-b-0 hover:bg-ground/70"
              >
                <div className="min-w-0 truncate font-semibold text-ink">{l.company}</div>
                <div className="min-w-0 truncate">{l.contactName || "—"}</div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: STATUS_COLOR[l.status] }}
                  />
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.06em]">
                    {LEAD_STATUS_LABEL[l.status]}
                  </span>
                </div>
                <div className="min-w-0 truncate text-muted">{l.assignedRepName || "Unassigned"}</div>
                <div className="text-right font-mono">
                  {l.estAnnualSpend != null ? money(Math.round(l.estAnnualSpend)) : "—"}
                </div>
                <div className="text-right font-mono text-[11px] text-muted">{shortDate(l.createdAt)}</div>
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
            setLeads((rows) => [lead, ...rows]);
            router.push(`/wholesaleportal/rep/leads/${lead.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
