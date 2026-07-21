"use client";

import { useMemo, useState } from "react";
import type { AuditEvent } from "@/lib/firestore/audit";
import { fullDate } from "@/lib/format";

export function ChangelogTable({ events }: { events: AuditEvent[] }) {
  const [entity, setEntity] = useState("all");
  const entities = useMemo(() => {
    const set = new Set(events.map((e) => e.entity).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [events]);

  const filtered = entity === "all" ? events : events.filter((e) => e.entity === entity);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[12px] text-secondary">
        <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">ENTITY</span>
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          className="h-9 rounded-chip border border-border bg-surface px-3 text-[12.5px] outline-none focus:border-accent"
        >
          {entities.map((e) => (
            <option key={e} value={e}>
              {e === "all" ? "All entities" : e}
            </option>
          ))}
        </select>
      </label>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[140px_1.2fr_1fr_1fr] border-b border-border px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          <span>When</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Entity</span>
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-[13px] text-muted">No audit events yet.</p>
        ) : (
          filtered.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[140px_1.2fr_1fr_1fr] border-b border-border/60 px-4 py-3 text-[12.5px] last:border-b-0"
            >
              <span className="font-mono text-[11px] text-muted">{fullDate(e.createdAt)}</span>
              <span className="truncate text-ink">{e.actorName || e.actorEmail || "—"}</span>
              <span className="truncate font-mono text-[11px] text-secondary">{e.action}</span>
              <span className="truncate text-muted">
                {e.entity}
                {e.entityId ? ` · ${e.entityId}` : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
