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
    "inline-flex h-8 shrink-0 items-center rounded-chip border border-border px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-secondary transition hover:border-accent hover:text-ink disabled:opacity-60";
  const btnPrimary =
    "inline-flex h-8 shrink-0 items-center rounded-chip bg-ink px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90 disabled:opacity-60";

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

  // Who's-working-it lives inside the dropdown itself (its closed-state value) instead
  // of a separate status line above the buttons — that line grew/shrank with the name
  // length and knocked the buttons out of alignment across rows/cards.
  const assigneeOptions = new Map<string, string>();
  if (isClaimed) assigneeOptions.set(claimedEmail, isMine ? "You" : label);
  for (const s of staffOptions) {
    const key = s.email.trim().toLowerCase();
    if (!assigneeOptions.has(key)) {
      assigneeOptions.set(key, key === me ? "You" : s.displayName);
    }
  }

  const claimButtons = (
    <>
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
        <button
          type="button"
          disabled={pending}
          className={btnPrimary}
          onClick={() => run(`/api/staff/quotes/${quoteId}/claim`)}
        >
          {pending ? "…" : "Take over"}
        </button>
      ) : null}
    </>
  );

  const assignSelect = (
    <select
      disabled={pending}
      value={claimedEmail}
      onFocus={loadStaffOptions}
      onChange={(e) => {
        const email = e.target.value;
        if (!email) {
          if (isClaimed) run(`/api/staff/quotes/${quoteId}/release`);
          return;
        }
        if (email === claimedEmail) return;
        run(`/api/staff/quotes/${quoteId}/assign`, { staffEmail: email });
      }}
      className={`h-8 min-w-0 rounded-chip border border-border bg-ground px-2 text-[11px] outline-none focus:border-accent disabled:opacity-60 ${
        isClaimed ? "text-ink" : "text-secondary"
      } ${compact ? "w-[112px] shrink-0" : "flex-1"}`}
      aria-label="Assigned to"
    >
      <option value="">Unassigned</option>
      {[...assigneeOptions.entries()].map(([email, displayName]) => (
        <option key={email} value={email}>
          {displayName}
        </option>
      ))}
    </select>
  );

  return (
    <div className={compact ? "flex flex-nowrap items-center justify-end gap-1.5" : "space-y-2"}>
      {compact ? (
        <>
          {claimButtons}
          {assignSelect}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {claimButtons}
          {assignSelect}
        </div>
      )}
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
