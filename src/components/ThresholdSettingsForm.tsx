"use client";

import { useActionState } from "react";

const fieldClass =
  "h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

type SettingsState = { error?: string; message?: string; ok?: boolean };

type SettingsAction = (
  prev: SettingsState | undefined,
  formData: FormData,
) => Promise<SettingsState>;

/**
 * Server action is passed from the Server Component page so this client
 * module never imports a `"use server"` file (avoids soft-nav webpack stub
 * collisions with Staff and other rep console pages).
 */
export function ThresholdSettingsForm({
  minItemCount,
  minCartTotal,
  notifyEmails,
  action: saveAction,
}: {
  minItemCount: number;
  minCartTotal: number;
  notifyEmails: string[];
  action: SettingsAction;
}) {
  const [state, action, pending] = useActionState(saveAction, {
    error: "",
    message: "",
  } as SettingsState);

  return (
    <form
      action={action}
      className="max-w-2xl space-y-5 rounded-card border border-border bg-surface p-6"
    >
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
        INVOICE REQUEST THRESHOLDS
      </div>
      <p className="text-[12.5px] text-secondary">
        Buyers must meet at least one active rule to submit their order for processing to
        invoice. Set a value to 0 to turn that rule off.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>MIN ITEM COUNT</span>
          <input
            name="minItemCount"
            type="number"
            min={0}
            step={1}
            defaultValue={minItemCount}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>MIN ORDER TOTAL ($)</span>
          <input
            name="minCartTotal"
            type="number"
            min={0}
            step={1}
            defaultValue={minCartTotal}
            className={fieldClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>ADDITIONAL NOTIFICATION EMAILS (COMMA-SEPARATED)</span>
        <textarea
          name="notifyEmails"
          rows={2}
          defaultValue={notifyEmails.join(", ")}
          placeholder="ops@luxesupply.com, manager@luxesupply.com"
          className="rounded-chip border border-border bg-ground px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
        />
      </label>
      <p className="text-[11px] text-muted">
        Active staff accounts are always notified when a buyer submits an invoice request. Add
        extra recipients here if needed. Sending requires{" "}
        <code className="font-mono">SENDGRID_API_KEY</code> to be configured on the server.
      </p>

      {state?.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
      {state?.message ? <p className="text-[12px] text-[#4E9A6A]">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
