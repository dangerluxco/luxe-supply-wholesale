"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";

export default function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const error = params.get("error") || "";
  const [pending, setPending] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-6 py-16">
      <div className="w-full max-w-md overflow-hidden rounded-card border border-border bg-surface p-10 shadow-[0_20px_60px_-30px_rgba(22,22,26,0.35)]">
        <Logo />
        <h1 className="mt-8 text-[24px] font-semibold tracking-tight text-ink">Set a new password</h1>
        <p className="mt-1 text-[13px] text-secondary">Choose a new password for your staff account.</p>

        {!token ? (
          <div className="mt-8 rounded-chip border border-danger/40 bg-danger/5 px-4 py-4 text-[12.5px] text-danger">
            Missing or invalid reset link.{" "}
            <Link href="/wholesaleportal/forgot-password" className="underline">
              Request a new one
            </Link>
            .
          </div>
        ) : (
          <form
            method="POST"
            action="/api/staff-reset-password"
            className="mt-8 flex flex-col gap-4"
            onSubmit={() => setPending(true)}
          >
            <input type="hidden" name="token" value={token} />
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-accent">NEW PASSWORD</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-accent">CONFIRM PASSWORD</span>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
              />
            </label>
            {error ? (
              <div className="flex items-center gap-2 text-[12px] text-danger">
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-danger text-[9px]">!</span>
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="mt-1 h-11 rounded-chip bg-ink text-[12.5px] font-semibold uppercase tracking-[0.14em] text-ground transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[12.5px] text-secondary">
          <Link href="/wholesaleportal/sign-in" className="text-accent underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
