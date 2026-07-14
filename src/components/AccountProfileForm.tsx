"use client";

import { useActionState } from "react";
import { updateAccountProfile } from "@/lib/actions/account";

const fieldClass =
  "h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

export function AccountProfileForm({
  displayName,
  email,
  phone,
  company,
}: {
  displayName: string;
  email: string;
  phone: string;
  company: string;
}) {
  const [state, action, pending] = useActionState(updateAccountProfile, {} as {
    error?: string;
    message?: string;
  });

  return (
    <form action={action} className="max-w-lg space-y-4 rounded-card border border-border bg-surface p-6">
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">ACCOUNT DETAILS</div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>NAME</span>
          <input name="displayName" defaultValue={displayName} required className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>EMAIL</span>
          <input name="email" type="email" defaultValue={email} required className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>PHONE</span>
          <input name="phone" defaultValue={phone} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>COMPANY</span>
          <input name="company" defaultValue={company} className={fieldClass} />
        </label>
      </div>

      {state?.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
      {state?.message ? <p className="text-[12px] text-[#4E9A6A]">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
