"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const btnClass =
  "rounded-chip border border-border px-2.5 py-1.5 text-[11px] text-secondary transition hover:border-accent hover:text-ink disabled:opacity-50";

/**
 * Per-row staff actions via fetch APIs — no `"use server"` props (soft-nav safe).
 */
export function StaffMemberActions({
  staffId,
  role,
  status,
  isSelf,
}: {
  staffId: string;
  role: "admin" | "staff" | "fulfillment";
  status: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyAction, setBusyAction] = useState<"admin" | "reset" | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetOk, setResetOk] = useState<{
    message: string;
    temporaryPassword: string;
    emailSent: boolean;
  } | null>(null);

  const disabled = status === "disabled";

  async function postJson(url: string, body?: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      temporaryPassword?: string;
      emailSent?: boolean;
    };
    if (!res.ok || data.error) {
      throw new Error(data.error || "Request failed.");
    }
    return data;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        <select
          value={role}
          disabled={pending}
          className={btnClass}
          onChange={(e) => {
            const nextRole = e.target.value;
            setError(null);
            setMessage(null);
            setResetOk(null);
            setBusyAction("admin");
            start(async () => {
              try {
                const data = await postJson(
                  `/api/staff/members/${encodeURIComponent(staffId)}/admin`,
                  { role: nextRole },
                );
                setMessage(data.message || "Updated.");
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not update role.");
              } finally {
                setBusyAction(null);
              }
            });
          }}
        >
          <option value="staff">Rep</option>
          <option value="admin">Admin</option>
          <option value="fulfillment">Fulfillment (PPAS)</option>
        </select>

        <button
          type="button"
          disabled={pending || disabled}
          title={disabled ? "Re-enable the account before resetting password" : undefined}
          className={btnClass}
          onClick={() => {
            if (
              !window.confirm(
                "Generate a new temporary password for this staff member and email it to them?",
              )
            ) {
              return;
            }
            setError(null);
            setMessage(null);
            setResetOk(null);
            setBusyAction("reset");
            start(async () => {
              try {
                const data = await postJson(
                  `/api/staff/members/${encodeURIComponent(staffId)}/reset-password`,
                );
                setResetOk({
                  message: data.message || "Password generated.",
                  temporaryPassword: data.temporaryPassword || "",
                  emailSent: !!data.emailSent,
                });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not generate password.");
              } finally {
                setBusyAction(null);
              }
            });
          }}
        >
          {busyAction === "reset" ? "Generating…" : "Generate new password"}
        </button>

        <button
          type="button"
          disabled={pending || isSelf}
          title={isSelf ? "You cannot disable your own account" : undefined}
          className={btnClass}
          onClick={() => {
            setError(null);
            setMessage(null);
            setResetOk(null);
            setBusyAction("status");
            start(async () => {
              try {
                const data = await postJson(
                  `/api/staff/members/${encodeURIComponent(staffId)}/status`,
                  { status: disabled ? "active" : "disabled" },
                );
                setMessage(data.message || "Updated.");
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not update status.");
                setBusyAction(null);
              }
            });
          }}
        >
          {disabled ? "Re-enable" : "Disable"}
        </button>
      </div>

      {error ? <p className="max-w-md text-right text-[11px] text-danger">{error}</p> : null}
      {message ? (
        <p className="max-w-md text-right text-[11px] text-[#4E9A6A]">{message}</p>
      ) : null}

      {resetOk ? (
        <div className="max-w-md rounded-chip border border-border bg-ground px-3 py-2 text-right text-[11px] text-secondary">
          <p className="text-[#4E9A6A]">{resetOk.message}</p>
          {resetOk.temporaryPassword ? (
            <p className="mt-1">
              Temp password:{" "}
              <span className="font-mono text-ink">{resetOk.temporaryPassword}</span>
            </p>
          ) : null}
          {!resetOk.emailSent ? (
            <p className="mt-1 text-muted">Copy and send manually if needed.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
