"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SalesGoals } from "@/lib/firestore/settings";

const fieldClass =
  "h-10 w-full rounded-chip border border-border bg-ground px-3 font-mono text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge mb-1.5 block text-[10px] tracking-[0.14em] text-muted";

/** Manager-set team sales goals — shown as progress on the performance screen. */
export function GoalsSettingsForm({
  initial,
  staff = [],
}: {
  initial: SalesGoals;
  /** Active staff for the per-rep quota list. */
  staff?: Array<{ email: string; name: string }>;
}) {
  const router = useRouter();
  const [monthlyRevenue, setMonthlyRevenue] = useState(String(initial.monthlyRevenue));
  const [monthlyGp, setMonthlyGp] = useState(String(initial.monthlyGp));
  const [weeklyRevenue, setWeeklyRevenue] = useState(
    initial.weeklyRevenue != null ? String(initial.weeklyRevenue) : "",
  );
  const [weeklyGp, setWeeklyGp] = useState(initial.weeklyGp != null ? String(initial.weeklyGp) : "");
  const [repQuotas, setRepQuotas] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      staff.map((s) => {
        const q = initial.repQuotas[s.email.trim().toLowerCase()];
        return [s.email, q != null && q > 0 ? String(q) : ""];
      }),
    ),
  );
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setMessage(null);
    setError(null);
    start(async () => {
      const quotaEntries = Object.entries(repQuotas)
        .map(([email, v]) => [email.trim().toLowerCase(), Number(v)] as const)
        .filter(([email, n]) => email && Number.isFinite(n) && n > 0);
      const res = await fetch("/api/staff/settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "goals",
          goals: {
            monthlyRevenue: Number(monthlyRevenue) || 0,
            monthlyGp: Number(monthlyGp) || 0,
            weeklyRevenue: weeklyRevenue.trim() === "" ? null : Number(weeklyRevenue),
            weeklyGp: weeklyGp.trim() === "" ? null : Number(weeklyGp),
            repQuotas: Object.fromEntries(quotaEntries),
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not save goals.");
        return;
      }
      setMessage(data.message || "Sales goals saved.");
      router.refresh();
    });
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">MONTHLY</div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={labelClass}>TARGET REVENUE ($)</span>
            <input
              inputMode="numeric"
              value={monthlyRevenue}
              onChange={(e) => setMonthlyRevenue(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label>
            <span className={labelClass}>TARGET GROSS PROFIT ($)</span>
            <input
              inputMode="numeric"
              value={monthlyGp}
              onChange={(e) => setMonthlyGp(e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>
      </div>

      <div>
        <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
          WEEKLY (OPTIONAL)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={labelClass}>TARGET REVENUE ($)</span>
            <input
              inputMode="numeric"
              value={weeklyRevenue}
              onChange={(e) => setWeeklyRevenue(e.target.value)}
              placeholder="Leave blank to skip"
              className={fieldClass}
            />
          </label>
          <label>
            <span className={labelClass}>TARGET GROSS PROFIT ($)</span>
            <input
              inputMode="numeric"
              value={weeklyGp}
              onChange={(e) => setWeeklyGp(e.target.value)}
              placeholder="Leave blank to skip"
              className={fieldClass}
            />
          </label>
        </div>
      </div>

      {staff.length > 0 ? (
        <div>
          <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
            PER-REP MONTHLY QUOTAS ($)
          </div>
          <div className="space-y-2">
            {staff.map((s) => (
              <label key={s.email} className="grid grid-cols-[1fr_140px] items-center gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium text-ink">{s.name}</span>
                  <span className="block truncate font-mono text-[10.5px] text-muted">{s.email}</span>
                </span>
                <input
                  inputMode="numeric"
                  value={repQuotas[s.email] ?? ""}
                  onChange={(e) =>
                    setRepQuotas((prev) => ({ ...prev, [s.email]: e.target.value }))
                  }
                  placeholder="No quota"
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            Each rep&apos;s attainment against their quota shows on the Performance table for the
            This Month range. Leave blank for no quota.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="h-10 rounded-chip bg-ink px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save goals"}
      </button>
      <p className="text-[11.5px] text-muted">
        Progress against these targets shows on the Performance screen for the This Month / This
        Week ranges. Revenue counts all invoiced sales; gross profit uses computed margin.
      </p>
    </div>
  );
}
