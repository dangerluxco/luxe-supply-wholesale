"use client";

import { useState, useTransition } from "react";

const fieldClass =
  "h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

/** Invite buyer via fetch API — no `"use server"` (soft-nav safe). */
export function InviteBuyerForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<{
    message: string;
    username?: string;
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
          const res = await fetch("/api/staff/buyers/invite", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: String(fd.get("email") || ""),
              username: String(fd.get("username") || ""),
              displayName: String(fd.get("displayName") || ""),
              company: String(fd.get("company") || ""),
              phone: String(fd.get("phone") || ""),
              password: String(fd.get("password") || ""),
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
            username?: string;
            temporaryPassword?: string;
          };
          if (!res.ok || data.error) {
            setError(data.error || "Could not create buyer.");
            return;
          }
          setOk({
            message: data.message || "Buyer created.",
            username: data.username,
            temporaryPassword: data.temporaryPassword,
          });
          form.reset();
        });
      }}
    >
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">INVITE BUYER</div>
      <p className="text-[12.5px] text-secondary">
        Creates a storefront login and emails the buyer their username + temporary password
        (also shown below after create). Username is derived from the email unless you override
        it.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>EMAIL *</span>
          <input name="email" type="email" required className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>USERNAME</span>
          <input name="username" placeholder="auto from email" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>DISPLAY NAME</span>
          <input name="displayName" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>COMPANY</span>
          <input name="company" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>PHONE</span>
          <input name="phone" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>TEMP PASSWORD</span>
          <input name="password" placeholder="auto-generated" className={fieldClass} />
        </label>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {ok ? (
        <p className="text-[12px] text-[#4E9A6A]">
          {ok.message} Username <span className="font-mono">@{ok.username}</span> · Temporary
          password <span className="font-mono">{ok.temporaryPassword}</span>
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create buyer"}
      </button>
    </form>
  );
}
