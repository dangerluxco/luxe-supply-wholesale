"use client";

import { useActionState } from "react";

const fieldClass =
  "h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

type InviteState = {
  error?: string;
  message?: string;
  ok?: boolean;
  username?: string;
  temporaryPassword?: string;
};

type InviteAction = (
  prev: InviteState | undefined,
  formData: FormData,
) => Promise<InviteState>;

/**
 * Server action is passed from the Server Component page so this client
 * module never imports a `"use server"` file (avoids soft-nav webpack stub collisions).
 */
export function InviteBuyerForm({ action: inviteAction }: { action: InviteAction }) {
  const [state, action, pending] = useActionState(inviteAction, {} as InviteState);

  return (
    <form
      action={action}
      className="mb-8 max-w-3xl space-y-4 rounded-card border border-border bg-surface p-6"
    >
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">INVITE BUYER</div>
      <p className="text-[12.5px] text-secondary">
        Creates a storefront login in Firestore <code className="font-mono">salesPortalBuyers</code>{" "}
        — the same collection the sign-in page reads from. Username is derived from the email
        unless you override it.
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

      {state?.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
      {state?.ok ? (
        <p className="text-[12px] text-[#4E9A6A]">
          {state.message} Username <span className="font-mono">@{state.username}</span> ·
          Temporary password <span className="font-mono">{state.temporaryPassword}</span>
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
