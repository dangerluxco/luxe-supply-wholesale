"use client";

import { useState, useTransition } from "react";

const fieldClass =
  "h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

/**
 * Invite staff via fetch API — no `"use server"` props (soft-nav safe).
 */
export function InviteStaffForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<{
    message: string;
    temporaryPassword?: string;
  } | null>(null);

  return (
    <form
      className="mb-8 max-w-3xl space-y-4 rounded-card border border-border bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setError(null);
        setOk(null);
        start(async () => {
          const res = await fetch("/api/staff/members/invite", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: String(fd.get("email") || ""),
              displayName: String(fd.get("displayName") || ""),
              password: String(fd.get("password") || ""),
              role: String(fd.get("role") || "staff"),
              sendEmail: fd.get("sendEmail") === "on",
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
            temporaryPassword?: string;
          };
          if (!res.ok || data.error) {
            setError(data.error || "Could not invite staff.");
            return;
          }
          setOk({
            message: data.message || "Staff created.",
            temporaryPassword: data.temporaryPassword,
          });
          form.reset();
        });
      }}
    >
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">INVITE STAFF</div>
      <p className="text-[12.5px] text-secondary">
        Creates a staff login in Firestore <code className="font-mono">salesPortalStaff</code> — the
        same collection the staff sign-in page reads from.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>EMAIL *</span>
          <input name="email" type="email" required className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>DISPLAY NAME</span>
          <input name="displayName" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>TEMP PASSWORD</span>
          <input name="password" placeholder="auto-generated" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>ROLE</span>
          <select name="role" defaultValue="staff" className={fieldClass}>
            <option value="staff">Rep</option>
            <option value="admin">Admin</option>
            <option value="fulfillment">Fulfillment (PPAS)</option>
          </select>
        </label>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-[12.5px] text-ink">
            <input name="sendEmail" type="checkbox" defaultChecked className="accent-accent" />
            Send invite email
          </label>
        </div>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {ok ? (
        <p className="text-[12px] text-[#4E9A6A]">
          {ok.message}{" "}
          {ok.temporaryPassword ? (
            <>
              Temporary password <span className="font-mono">{ok.temporaryPassword}</span>
            </>
          ) : null}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Creating…" : "Invite staff"}
      </button>
    </form>
  );
}
