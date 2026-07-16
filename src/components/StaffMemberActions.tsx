"use client";

import { useActionState } from "react";

type ActionState = {
  error?: string;
  message?: string;
  ok?: boolean;
  temporaryPassword?: string;
  emailSent?: boolean;
};

type StaffAction = (
  prev: ActionState | undefined,
  formData: FormData,
) => Promise<ActionState>;

const btnClass =
  "rounded-chip border border-border px-2.5 py-1.5 text-[11px] text-secondary transition hover:border-accent hover:text-ink disabled:opacity-50";

/**
 * Per-row staff actions. Actions are passed from the Server Component so this
 * client module never imports `"use server"` files (soft-nav stub safety).
 */
export function StaffMemberActions({
  staffId,
  isAdmin,
  status,
  isSelf,
  setAdminAction,
  setStatusAction,
  resetPasswordAction,
}: {
  staffId: string;
  isAdmin: boolean;
  status: string;
  isSelf: boolean;
  setAdminAction: StaffAction;
  setStatusAction: StaffAction;
  resetPasswordAction: StaffAction;
}) {
  const [adminState, adminFormAction, adminPending] = useActionState(
    setAdminAction,
    {} as ActionState,
  );
  const [statusState, statusFormAction, statusPending] = useActionState(
    setStatusAction,
    {} as ActionState,
  );
  const [resetState, resetFormAction, resetPending] = useActionState(
    resetPasswordAction,
    {} as ActionState,
  );

  const disabled = status === "disabled";
  const pending = adminPending || statusPending || resetPending;
  const feedback =
    adminState?.error ||
    statusState?.error ||
    resetState?.error ||
    (adminState?.ok ? adminState.message : null) ||
    (statusState?.ok ? statusState.message : null) ||
    (resetState?.ok
      ? `${resetState.message || ""}${
          resetState.temporaryPassword
            ? ` Temporary password: ${resetState.temporaryPassword}`
            : ""
        }`
      : null);
  const isError = !!(adminState?.error || statusState?.error || resetState?.error);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        <form action={adminFormAction}>
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="isAdmin" value={isAdmin ? "false" : "true"} />
          <button type="submit" disabled={pending} className={btnClass}>
            {isAdmin ? "Remove admin" : "Make admin"}
          </button>
        </form>

        <form
          action={resetFormAction}
          onSubmit={(e) => {
            if (
              !window.confirm(
                "Reset this staff member’s password and email a temporary password?",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="staffId" value={staffId} />
          <button type="submit" disabled={pending} className={btnClass}>
            Reset password
          </button>
        </form>

        <form action={statusFormAction}>
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="status" value={disabled ? "active" : "disabled"} />
          <button
            type="submit"
            disabled={pending || isSelf}
            title={isSelf ? "You cannot disable your own account" : undefined}
            className={btnClass}
          >
            {disabled ? "Re-enable" : "Disable"}
          </button>
        </form>
      </div>

      {feedback ? (
        <p className={`max-w-md text-right text-[11px] ${isError ? "text-danger" : "text-[#4E9A6A]"}`}>
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
