"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { clsx } from "@/lib/clsx";
import type { DashboardOrderRow } from "@/app/api/staff/quotes/route";

const POLL_MS = 2500;

const STATUS_FILTERS = [
  { value: "open_orders", label: "Open orders" },
  { value: "open", label: "Open" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Invoiced" },
  { value: "closed", label: "Closed" },
  { value: "declined", label: "Declined" },
  { value: "timed_out", label: "Timed out" },
  { value: "all", label: "All" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  contacted: "Contacted",
  quoted: "Invoiced",
  closed: "Closed",
  declined: "Declined",
  timed_out: "Timed out",
};

const STATUS_COLOR: Record<string, string> = {
  open: "#4E9A6A",
  contacted: "#B08D3E",
  quoted: "#3A7CA5",
  closed: "#8B897F",
  declined: "#A65440",
  timed_out: "#8B897F",
};

type SortField = "createdAt" | "total" | "client";

function elapsed(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function LiveOrdersDashboard({
  initialRows,
  initialStatus,
}: {
  initialRows: DashboardOrderRow[];
  initialStatus: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DashboardOrderRow[]>(initialRows);
  const [status, setStatus] = useState(initialStatus);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [live, setLive] = useState(true);
  const statusRef = useRef(status);
  statusRef.current = status;

  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const res = await fetch(`/api/staff/quotes?status=${encodeURIComponent(statusRef.current)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setLive(false);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { rows?: DashboardOrderRow[] };
      setLive(true);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setLastUpdated(new Date());
    } catch {
      setLive(false);
    }
  }, []);

  // Re-fetch immediately whenever the status filter changes.
  useEffect(() => {
    void poll();
  }, [status, poll]);

  useEffect(() => {
    const id = setInterval(() => void poll(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "client" ? "asc" : "desc");
    }
  }

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortField === "total") return (a.total - b.total) * dir;
      if (sortField === "client") return a.client.localeCompare(b.client, undefined, { sensitivity: "base" }) * dir;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || "")) * dir;
    });
  }, [rows, sortField, sortDir]);

  const summary = useMemo(() => {
    const totalValue = rows.reduce((s, r) => s + (r.total || 0), 0);
    return { count: rows.length, totalValue };
  }, [rows]);

  function sortIndicator(field: SortField) {
    if (sortField !== field) return null;
    return <span className="ml-1 text-accent">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <span
            className={clsx(
              "h-[7px] w-[7px] rounded-full",
              live ? "bg-success" : "bg-danger",
            )}
          />
          {live ? "Live" : "Reconnecting…"}
          {lastUpdated ? ` · updated ${elapsed(lastUpdated.toISOString())}` : null}
        </div>
        <div className="flex-1" />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-chip border border-border bg-surface px-3 text-[12px] text-ink outline-none focus:border-accent"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-muted">TOTAL OPEN ORDERS</div>
          <div className="mt-1 text-[26px] font-semibold text-ink">{summary.count}</div>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-muted">TOTAL VALUE</div>
          <div className="mt-1 text-[26px] font-semibold text-ink">{money(summary.totalValue)}</div>
        </div>
      </div>

      {sortedRows.length === 0 ? (
        <div className="rounded-card border border-dashed border-border px-5 py-10 text-center text-[12.5px] text-muted">
          No orders match this filter right now.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1.4fr_0.9fr_70px_100px_130px_110px] items-center border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              <button
                type="button"
                onClick={() => toggleSort("client")}
                className="flex items-center text-left hover:text-ink"
              >
                Client {sortIndicator("client")}
              </button>
              <span>Company</span>
              <span className="text-center">Items</span>
              <button
                type="button"
                onClick={() => toggleSort("total")}
                className="flex items-center justify-end hover:text-ink"
              >
                Amount {sortIndicator("total")}
              </button>
              <span>Status</span>
              <button
                type="button"
                onClick={() => toggleSort("createdAt")}
                className="flex items-center justify-end hover:text-ink"
              >
                Time {sortIndicator("createdAt")}
              </button>
            </div>

            {sortedRows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => router.push(`/wholesaleportal/rep/quotes/${r.id}`)}
                className="grid w-full grid-cols-[1.4fr_0.9fr_70px_100px_130px_110px] items-center border-b border-border/60 px-5 py-3.5 text-left text-[12.5px] text-[#3A3934] transition last:border-b-0 hover:bg-ground/70"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">{r.client}</div>
                  <div className="truncate font-mono text-[11px] text-muted">{r.email || "—"}</div>
                </div>
                <div className="min-w-0 truncate">{r.company || "—"}</div>
                <div className="text-center font-mono">{r.itemCount}</div>
                <div className="text-right font-mono font-semibold text-ink">{money(r.total)}</div>
                <div className="flex items-center gap-1.5 text-[11.5px]">
                  <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: STATUS_COLOR[r.status] || "#8B897F" }}
                  />
                  {STATUS_LABEL[r.status] || r.status}
                </div>
                <div className="text-right font-mono text-muted">{elapsed(r.createdAt)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
