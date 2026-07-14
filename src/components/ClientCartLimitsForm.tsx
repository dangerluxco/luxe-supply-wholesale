"use client";

import { useActionState } from "react";

const fieldClass =
  "h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

type LimitsState = { error?: string; message?: string; ok?: boolean };

type LimitsAction = (
  prev: LimitsState | undefined,
  formData: FormData,
) => Promise<LimitsState>;

/**
 * Server action is passed from the Server Component page so this client
 * module never imports a `"use server"` file (avoids soft-nav webpack stub collisions
 * with InviteBuyerForm on /clients ↔ /clients/[id]).
 */
export function ClientCartLimitsForm({
  action: saveAction,
  buyerId,
  maxCartItems,
  maxCartValue,
}: {
  action: LimitsAction;
  buyerId: string;
  maxCartItems: number;
  maxCartValue: number;
}) {
  const [state, action, pending] = useActionState(saveAction, {
    error: "",
    message: "",
  } as LimitsState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="buyerId" value={buyerId} />
      <p className="text-[12.5px] text-secondary">
        Caps how many pieces and how much dollar value this buyer can hold in cart / on soft
        hold. Defaults are 5 items / $5,000.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>MAX ITEMS</span>
          <input
            name="maxCartItems"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={maxCartItems}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>MAX VALUE ($)</span>
          <input
            name="maxCartValue"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={maxCartValue}
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
        {pending ? "Saving…" : "Save limits"}
      </button>
    </form>
  );
}
