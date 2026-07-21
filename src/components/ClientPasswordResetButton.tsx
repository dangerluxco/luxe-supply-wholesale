"use client";

import { useState, useTransition } from "react";
import { PressableButton } from "@/components/PressableButton";

/** Staff: generate + email a new buyer temp password (soft-nav safe fetch API). */
export function ClientPasswordResetButton({
  buyerId,
  buyerEmail,
  disabled,
}: {
  buyerId: string;
  buyerEmail: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<{
    message: string;
    temporaryPassword: string;
    emailSent: boolean;
  } | null>(null);

  return (
    <div className="space-y-3">
      <PressableButton
        pending={pending}
        pendingLabel="Generating…"
        disabled={disabled}
        title={
          disabled
            ? "Re-enable the account before resetting password"
            : !buyerEmail
              ? "No email on file — password will still be shown here"
              : undefined
        }
        onClick={() => {
          setError(null);
          setOk(null);
          start(async () => {
            const res = await fetch(
              `/api/staff/buyers/${encodeURIComponent(buyerId)}/reset-password`,
              { method: "POST", credentials: "same-origin" },
            );
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
              message?: string;
              temporaryPassword?: string;
              emailSent?: boolean;
            };
            if (!res.ok || data.error) {
              setError(data.error || "Could not reset password.");
              return;
            }
            setOk({
              message: data.message || "Password reset.",
              temporaryPassword: data.temporaryPassword || "",
              emailSent: !!data.emailSent,
            });
          });
        }}
        className="h-9 rounded-chip border border-border px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink disabled:opacity-60"
      >
        Generate new password
      </PressableButton>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {ok ? (
        <div className="rounded-chip border border-border bg-ground px-3 py-2 text-[12px] text-secondary">
          <p className="text-[#4E9A6A]">{ok.message}</p>
          {ok.temporaryPassword ? (
            <p className="mt-1">
              Temporary password{" "}
              <span className="font-mono text-ink">{ok.temporaryPassword}</span>
              {!ok.emailSent ? " — copy and share with the buyer" : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
