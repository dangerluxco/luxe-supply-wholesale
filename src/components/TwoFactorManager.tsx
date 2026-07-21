"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SetupPayload = {
  secret: string;
  secretEnc: string;
  otpauthUrl: string;
  qrUrl: string;
  recoveryCodes: string[];
  recoveryHashes: string[];
};

export function TwoFactorManager({
  mode,
  email,
}: {
  mode: "enroll" | "verify";
  email: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [code, setCode] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);

  function beginSetup() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/staff/2fa/setup", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as SetupPayload & { error?: string };
      if (!res.ok || data.error || !data.secretEnc) {
        setError(data.error || "Could not start 2FA setup.");
        return;
      }
      setSetup(data);
      setShowRecovery(true);
    });
  }

  function enable() {
    if (!setup) return;
    setError(null);
    start(async () => {
      const res = await fetch("/api/staff/2fa/enable", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretEnc: setup.secretEnc,
          recoveryHashes: setup.recoveryHashes,
          code,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not enable 2FA.");
        return;
      }
      router.replace("/wholesaleportal/rep/dashboard");
      router.refresh();
    });
  }

  function verify() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/staff/2fa/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Invalid code.");
        return;
      }
      router.replace(data.redirect || "/wholesaleportal/rep/dashboard");
      router.refresh();
    });
  }

  if (mode === "verify") {
    return (
      <div className="mx-auto w-full max-w-md space-y-5 rounded-card border border-border bg-surface p-8">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">SECURITY</div>
        <h1 className="text-[22px] font-semibold text-ink">Two-factor verification</h1>
        <p className="text-[13px] text-secondary">
          Enter the 6-digit code from your authenticator app for <strong>{email}</strong>, or a
          recovery code.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">CODE</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            inputMode="numeric"
            className="h-11 rounded-chip border border-border bg-ground px-3 text-center text-[18px] tracking-[0.2em] outline-none focus:border-accent"
            placeholder="000000"
          />
        </label>
        {error ? <p className="text-[13px] text-danger">{error}</p> : null}
        <button
          type="button"
          disabled={pending || code.trim().length < 6}
          onClick={verify}
          className="h-11 w-full rounded-chip bg-ink text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Verifying…" : "Continue"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 rounded-card border border-border bg-surface p-8">
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">REQUIRED</div>
      <h1 className="text-[22px] font-semibold text-ink">Set up two-factor authentication</h1>
      <p className="text-[13px] text-secondary">
        Managers must enroll an authenticator app before using the staff portal. Scan the QR code,
        save your recovery codes, then confirm with a 6-digit code.
      </p>

      {!setup ? (
        <button
          type="button"
          disabled={pending}
          onClick={beginSetup}
          className="h-11 rounded-chip bg-ink px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Preparing…" : "Begin setup"}
        </button>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-ground p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrUrl} alt="Authenticator QR code" width={220} height={220} />
            <p className="break-all text-center font-mono text-[11px] text-muted">{setup.secret}</p>
          </div>

          {showRecovery ? (
            <div className="rounded-card border border-border bg-ground p-4">
              <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
                RECOVERY CODES — SAVE THESE
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-[12px] text-ink">
                {setup.recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
              CONFIRM CODE FROM APP
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              className="h-11 rounded-chip border border-border bg-ground px-3 text-center text-[18px] tracking-[0.2em] outline-none focus:border-accent"
              placeholder="000000"
            />
          </label>

          <button
            type="button"
            disabled={pending || code.trim().length < 6}
            onClick={enable}
            className="h-11 w-full rounded-chip bg-ink text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
          >
            {pending ? "Enabling…" : "Enable 2FA"}
          </button>
        </>
      )}

      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
