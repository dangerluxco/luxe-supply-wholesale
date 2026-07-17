"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";

export default function ForgotPasswordForm() {
  const params = useSearchParams();
  const sent = params.get("sent") === "1";
  const [pending, setPending] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-6 py-16">
      <div className="w-full max-w-md overflow-hidden rounded-card border border-border bg-surface p-10 shadow-[0_20px_60px_-30px_rgba(22,22,26,0.35)]">
        <Logo />
        <h1 className="mt-8 text-[24px] font-semibold tracking-tight text-ink">Reset your password</h1>
        <p className="mt-1 text-[13px] text-secondary">
          Enter your username or email — we'll send a link to reset your password.
        </p>

        {sent ? (
          <div className="mt-8 rounded-chip border border-border bg-ground px-4 py-4 text-[12.5px] text-secondary">
            If that account exists, a reset link is on its way to the email on file. It expires in
            1 hour. Check spam if you don't see it soon.
          </div>
        ) : (
          <form
            method="POST"
            action="/api/buyer-forgot-password"
            className="mt-8 flex flex-col gap-4"
            onSubmit={() => setPending(true)}
          >
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-accent">
                USERNAME OR EMAIL
              </span>
              <input
                name="identifier"
                type="text"
                required
                autoComplete="username"
                className="h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="mt-1 h-11 rounded-chip bg-ink text-[12.5px] font-semibold uppercase tracking-[0.14em] text-ground transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[12.5px] text-secondary">
          <a href="/wholesale/sign-in" className="text-accent underline">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}
