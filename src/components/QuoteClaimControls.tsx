"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type StaffOption = { email: string; displayName: string };

/**
 * Claim/release/assign via API routes — avoids soft-nav webpack stub
 * collisions from embedding multiple `"use server"` action modules on the
 * order-request page.
 */
export function QuoteClaimControls({
  quoteId,
  claimedByEmail,
  claimedByName,
  currentStaffEmail,
  compact,
}: {
  quoteId: string;
  claimedByEmail: string | null;
  claimedByName: string | null;
  currentStaffEmail: string;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const loadedStaff = useRef(false);

  const me = currentStaffEmail.trim().toLowerCase();
  const claimedEmail = (claimedByEmail || "").trim().toLowerCase();
  const isMine = !!claimedEmail && claimedEmail === me;
  const isClaimed = !!claimedEmail;
  const label = claimedByName || claimedByEmail || "Staff";

  const btn =
    "inline-flex h-8 items-center rounded-chip border border-border px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-secondary transition hover:border-accent hover:text-ink disabled:opacity-60";
  const btnPrimary =
    "inline-flex h-8 items-center rounded-chip bg-ink px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90 disabled:opacity-60";

  async function post(path: string, body?: Record<string, unknown>) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
    if (!res.ok || data.error) throw new Error(data.error || "Request failed.");
  }

  function run(path: string, body?: Record<string, unknown>) {
    setError(null);
    start(async () => {
      try {
        await post(path, body);
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed.");
      }
    });
  }

  function loadStaffOptions() {
    if (loadedStaff.current) return;
    loadedStaff.current = true;
    fetch("/api/staff/directory", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { staff?: StaffOption[] }) => setStaffOptions(data.staff || []))
      .catch(() => {
        loadedStaff.current = false;
      });
  }

  useEffect(() => {
    loadStaffOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={compact ? "flex flex-col items-end gap-1" : "space-y-3"}>
      {isClaimed ? (
        <p
          className={`text-[12px] ${compact ? "text-right text-[11px]" : ""} ${
            isMine ? "text-ink" : "text-secondary"
          }`}
        >
          {isMine ? (
            <>
              <span className="font-medium">You</span>
              {!compact ? " are working this request" : " · working"}
            </>
          ) : (
            <>
              <span className="font-medium text-ink">{label}</span>
              {!compact ? " is working this request" : ""}
            </>
          )}
        </p>
      ) : !compact ? (
        <p className="text-[12.5px] text-secondary">No one has claimed this request yet.</p>
      ) : null}

      <div className={`flex flex-wrap gap-2 ${compact ? "justify-end" : ""}`}>
        {!isClaimed ? (
          <button
            type="button"
            disabled={pending}
            className={btnPrimary}
            onClick={() => run(`/api/staff/quotes/${quoteId}/claim`)}
          >
            {pending ? "…" : "Claim"}
          </button>
        ) : null}

        {isMine ? (
          <button
            type="button"
            disabled={pending}
            className={btn}
            onClick={() => run(`/api/staff/quotes/${quoteId}/release`)}
          >
            {pending ? "…" : "Release"}
          </button>
        ) : null}

        {isClaimed && !isMine ? (
          <>
            <button
              type="button"
              disabled={pending}
              className={btnPrimary}
              onClick={() => run(`/api/staff/quotes/${quoteId}/claim`)}
            >
              {pending ? "…" : "Take over"}
            </button>
            {!compact ? (
              <button
                type="button"
                disabled={pending}
                className={btn}
                onClick={() => run(`/api/staff/quotes/${quoteId}/release`)}
              >
                {pending ? "…" : "Clear"}
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      <div className={`flex items-center gap-2 ${compact ? "" : "pt-1"}`}>
        <select
          disabled={pending}
          value=""
          onFocus={loadStaffOptions}
          onChange={(e) => {
            const email = e.target.value;
            if (!email) return;
            run(`/api/staff/quotes/${quoteId}/assign`, { staffEmail: email });
          }}
          className={`h-8 rounded-chip border border-border bg-ground px-2 text-[11px] text-secondary outline-none focus:border-accent disabled:opacity-60 ${
            compact ? "w-full min-w-[140px]" : "flex-1"
          }`}
          aria-label="Assign staff"
        >
          <option value="">Assign to…</option>
          {staffOptions.map((s) => (
            <option key={s.email} value={s.email}>
              {s.displayName}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
