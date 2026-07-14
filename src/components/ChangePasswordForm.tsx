"use client";

import { useActionState, useRef } from "react";
import { changeAccountPassword } from "@/lib/actions/account";

const fieldClass =
  "h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: { error?: string; message?: string } | undefined, formData: FormData) => {
    const res = await changeAccountPassword(prev, formData);
    if (res?.ok) formRef.current?.reset();
    return res;
  }, {} as { error?: string; message?: string });

  return (
    <form
      ref={formRef}
      action={action}
      className="mt-6 max-w-lg space-y-4 rounded-card border border-border bg-surface p-6"
    >
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">CHANGE PASSWORD</div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>CURRENT PASSWORD</span>
        <input name="currentPassword" type="password" required autoComplete="current-password" className={fieldClass} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>NEW PASSWORD</span>
          <input
            name="newPassword"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>CONFIRM NEW PASSWORD</span>
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={fieldClass}
          />
        </label>
      </div>

      {state?.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
      {state?.message ? <p className="text-[12px] text-[#4E9A6A]">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
