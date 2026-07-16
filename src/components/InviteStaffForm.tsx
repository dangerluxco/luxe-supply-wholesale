"use client";

import { useActionState } from "react";

const fieldClass =
  "h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

type InviteState = {
  error?: string;
  message?: string;
  ok?: boolean;
  email?: string;
  temporaryPassword?: string;
  emailSent?: boolean;
};

type InviteAction = (
  prev: InviteState | undefined,
  formData: FormData,
) => Promise<InviteState>;

/**
 * Server action is passed from the Server Component page so this client
 * module never imports a `"use server"` file (avoids soft-nav webpack stub collisions).
 */
export function InviteStaffForm({ action: inviteAction }: { action: InviteAction }) {
  const [state, action, pending] = useActionState(inviteAction, {} as InviteState);

  return (
    <form
      action={action}
      className="mb-8 max-w-3xl space-y-4 rounded-card border border-border bg-surface p-6"
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
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-[12.5px] text-ink">
            <input name="isAdmin" type="checkbox" className="accent-accent" />
            Make admin
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-ink">
            <input name="sendEmail" type="checkbox" defaultChecked className="accent-accent" />
            Send invite email
          </label>
        </div>
      </div>

      {state?.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
      {state?.ok ? (
        <p className="text-[12px] text-[#4E9A6A]">
          {state.message}{" "}
          {state.temporaryPassword ? (
            <>
              Temporary password{" "}
              <span className="font-mono">{state.temporaryPassword}</span>
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
