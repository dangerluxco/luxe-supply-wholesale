"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";

const isDev = process.env.NODE_ENV === "development";

export default function BuyerLoginForm() {
  const params = useSearchParams();
  const error = params.get("error") || "";
  const next = params.get("next") || "";
  const [pending, setPending] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-6 py-16">
      <div className="w-full max-w-md overflow-hidden rounded-card border border-border bg-surface p-10 shadow-[0_20px_60px_-30px_rgba(22,22,26,0.35)]">
        <Logo />
        <h1 className="mt-8 text-[24px] font-semibold tracking-tight text-ink">
          Buyer storefront
        </h1>
        <p className="mt-1 text-[13px] text-secondary">
          Sign in with your LuxeSupply wholesale client username and password.
        </p>

        <form
          method="POST"
          action="/api/buyer-login"
          className="mt-8 flex flex-col gap-4"
          autoComplete={isDev ? "off" : "on"}
          onSubmit={() => setPending(true)}
        >
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <label className="flex flex-col gap-1.5">
            <span className="micro-badge text-[10px] tracking-[0.14em] text-accent">USERNAME</span>
            <input
              name="username"
              type="text"
              defaultValue={isDev ? "howcouldyouforget" : undefined}
              autoComplete={isDev ? "off" : "username"}
              required
              className="h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="micro-badge text-[10px] tracking-[0.14em] text-accent">PASSWORD</span>
            <input
              name="password"
              type="password"
              defaultValue={isDev ? "Gmoney2026" : undefined}
              autoComplete={isDev ? "off" : "current-password"}
              required
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
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-[12.5px] text-secondary">
          Need access?{" "}
          <a href="/wholesale/register" className="text-accent underline">
            Request to join
          </a>
        </p>
      </div>
    </div>
  );
}
