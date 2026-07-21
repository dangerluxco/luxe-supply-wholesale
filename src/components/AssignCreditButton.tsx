"use client";

import { useState, useTransition } from "react";
import type { PortalBuyer } from "@/lib/firestore/buyers";
import { money } from "@/lib/format";

const fieldClass =
  "h-10 w-full rounded-chip border border-border bg-ground px-3 text-[13px] text-ink outline-none focus:border-accent";

const PRESETS = [5_000, 10_000, 15_000, 25_000, 50_000] as const;

export function AssignCreditButton({
  buyer,
  outstanding = 0,
  variant = "button",
}: {
  buyer: PortalBuyer;
  outstanding?: number;
  /** "button" = header CTA; "link" = inline text action in the standing card */
  variant?: "button" | "link";
}) {
  const [open, setOpen] = useState(false);
  const [creditLimit, setCreditLimit] = useState(
    buyer.creditLimit != null ? String(buyer.creditLimit) : "",
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasLimit = buyer.creditLimit != null && buyer.creditLimit > 0;
  const label = hasLimit ? "Update credit" : "Assign credit";

  function openModal() {
    setCreditLimit(buyer.creditLimit != null ? String(buyer.creditLimit) : "");
    setError(null);
    setOpen(true);
  }

  function submit(clear = false) {
    setError(null);
    const trimmed = creditLimit.trim();
    let next: number | null = null;
    if (!clear) {
      if (!trimmed) {
        setError("Enter a credit limit, or clear credit instead.");
        return;
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) {
        setError("Credit limit must be a positive number.");
        return;
      }
      next = n;
    }

    start(async () => {
      const res = await fetch(`/api/staff/buyers/${encodeURIComponent(buyer.id)}/account`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditLimit: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; buyer?: PortalBuyer };
      if (!res.ok || data.error || !data.buyer) {
        setError(data.error || "Could not save credit limit.");
        return;
      }
      setOpen(false);
      window.location.reload();
    });
  }

  return (
    <>
      {variant === "link" ? (
        <button
          type="button"
          onClick={openModal}
          className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent hover:underline"
        >
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={openModal}
          className="inline-flex h-9 items-center rounded-chip border border-border px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink transition hover:border-accent"
        >
          {label}
        </button>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/40 p-6 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[420px] max-w-full overflow-hidden rounded-card border border-border bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-[16px] font-semibold text-ink">{label}</h2>
                <p className="mt-0.5 text-[12px] text-muted">
                  {buyer.displayName || `@${buyer.username}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] text-muted hover:text-ink"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-chip border border-border/70 bg-ground px-3.5 py-3 text-[12.5px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">Outstanding balance</span>
                  <span className="font-mono font-semibold text-ink">{money(outstanding)}</span>
                </div>
                {hasLimit ? (
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="text-muted">Current limit</span>
                    <span className="font-mono text-ink">{money(buyer.creditLimit!)}</span>
                  </div>
                ) : (
                  <p className="mt-1.5 text-[11.5px] text-muted">No credit limit assigned yet.</p>
                )}
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                  CREDIT LIMIT ($)
                </span>
                <input
                  type="number"
                  min={1}
                  step={500}
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="e.g. 15000"
                  className={fieldClass}
                  autoFocus
                />
              </label>

              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCreditLimit(String(n))}
                    className={
                      "h-7 rounded-chip border px-2.5 font-mono text-[11px] transition " +
                      (creditLimit === String(n)
                        ? "border-ink bg-ink text-ground"
                        : "border-border text-muted hover:border-accent hover:text-ink")
                    }
                  >
                    {money(n)}
                  </button>
                ))}
              </div>

              {error ? <p className="text-[12px] text-danger">{error}</p> : null}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
              {hasLimit ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submit(true)}
                  className="text-[11px] font-semibold uppercase tracking-[0.1em] text-danger hover:underline disabled:opacity-60"
                >
                  Clear credit
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-[11px] text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submit(false)}
                  className="h-10 rounded-chip bg-ink px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
                >
                  {pending ? "Saving…" : "Save credit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
