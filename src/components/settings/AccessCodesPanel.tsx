"use client";

import { useState, useTransition } from "react";
import type { InviteCode } from "@/lib/firestore/inviteCodes";
import { fullDate } from "@/lib/format";

export function AccessCodesPanel({ initial }: { initial: InviteCode[] }) {
  const [codes, setCodes] = useState(initial);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [pending, start] = useTransition();
  const [busyAction, setBusyAction] = useState<"create" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function create() {
    setError(null);
    setMessage(null);
    setBusyAction("create");
    start(async () => {
      const res = await fetch("/api/staff/invite-codes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, maxUses: Number(maxUses) || 1 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: InviteCode;
      };
      if (!res.ok || data.error || !data.code) {
        setError(data.error || "Could not create code.");
        setBusyAction(null);
        return;
      }
      setCodes((prev) => [data.code!, ...prev]);
      setLabel("");
      setMessage(`Created ${data.code.code}`);
      setBusyAction(null);
    });
  }

  function revoke(id: string) {
    setError(null);
    setBusyAction("revoke");
    start(async () => {
      const res = await fetch(`/api/staff/invite-codes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not revoke code.");
        setBusyAction(null);
        return;
      }
      setCodes((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, revokedAt: new Date().toISOString() } : c,
        ),
      );
      setBusyAction(null);
    });
  }

  function copyLink(code: string) {
    const url = `${window.location.origin}/wholesale/register?code=${encodeURIComponent(code)}`;
    void navigator.clipboard.writeText(url);
    setMessage("Registration link copied.");
  }

  return (
    <div className="space-y-6">
      <div className="max-w-xl space-y-3 rounded-card border border-border bg-surface p-5">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">NEW INVITE CODE</div>
        <p className="text-[12.5px] text-secondary">
          Buyers must enter a valid code on the registration form. Direct staff invites still work
          without a code.
        </p>
        <div className="grid grid-cols-[1fr_100px_auto] gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Spring showroom)"
            className="h-10 rounded-chip border border-border bg-ground px-3 text-[13px] outline-none focus:border-accent"
          />
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[13px] outline-none focus:border-accent"
            title="Max uses"
          />
          <button
            type="button"
            disabled={pending}
            aria-busy={busyAction === "create" || undefined}
            onClick={create}
            className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ground disabled:opacity-60"
          >
            {busyAction === "create" ? "Creating…" : "Create"}
          </button>
        </div>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[1.1fr_1fr_70px_70px_1fr_140px] border-b border-border px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          <span>Code</span>
          <span>Label</span>
          <span>Used</span>
          <span>Max</span>
          <span>Created</span>
          <span className="text-right">Actions</span>
        </div>
        {codes.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-muted">No invite codes yet.</p>
        ) : (
          codes.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[1.1fr_1fr_70px_70px_1fr_140px] items-center border-b border-border/60 px-4 py-3 text-[12.5px] last:border-b-0"
            >
              <span className="font-mono font-semibold text-ink">{c.code}</span>
              <span className="truncate text-secondary">{c.label || "—"}</span>
              <span className="font-mono text-muted">{c.usedCount}</span>
              <span className="font-mono text-muted">{c.maxUses}</span>
              <span className="font-mono text-[11px] text-muted">
                {c.revokedAt ? "Revoked" : fullDate(c.createdAt)}
              </span>
              <span className="flex justify-end gap-2">
                {!c.revokedAt ? (
                  <>
                    <button
                      type="button"
                      onClick={() => copyLink(c.code)}
                      className="text-[11px] uppercase tracking-[0.08em] text-accent hover:underline"
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      aria-busy={busyAction === "revoke" || undefined}
                      onClick={() => revoke(c.id)}
                      className="text-[11px] uppercase tracking-[0.08em] text-danger hover:underline"
                    >
                      {busyAction === "revoke" ? "Revoking…" : "Revoke"}
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-muted">—</span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
