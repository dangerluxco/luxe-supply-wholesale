"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

const isDev = process.env.NODE_ENV === "development";
const REMEMBER_KEY = "luxe-wholesale-staff-remember";
const EMAIL_KEY = "luxe-wholesale-staff-email";

export default function LoginForm() {
  const params = useSearchParams();
  const error = params.get("error") || "";
  const ok = params.get("ok") || "";
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState(isDev ? "dan@luxesupply.co" : "");
  const [password, setPassword] = useState(isDev ? "luxe2026" : "");
  const [remember, setRemember] = useState(true);
  const [emailLocked, setEmailLocked] = useState(isDev);
  const [passwordLocked, setPasswordLocked] = useState(isDev);

  useEffect(() => {
    if (isDev) return;
    try {
      const savedRemember = localStorage.getItem(REMEMBER_KEY) === "1";
      setRemember(savedRemember);
      const savedEmail = localStorage.getItem(EMAIL_KEY);
      if (savedRemember && savedEmail) {
        setEmail(savedEmail);
        setEmailLocked(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-6 py-16">
      <div className="w-full max-w-md overflow-hidden rounded-card border border-border bg-surface p-10 shadow-[0_20px_60px_-30px_rgba(22,22,26,0.35)]">
        <Logo />
        <h1 className="mt-8 text-[24px] font-semibold tracking-tight text-ink">
          Staff portal
        </h1>
        <p className="mt-1 text-[13px] text-secondary">
          Sign in with your LuxeSupply wholesale staff credentials. Inventory and clients load live from Firestore.
        </p>

        <form
          method="POST"
          action="/api/login"
          className="mt-8 flex flex-col gap-4"
          autoComplete={isDev ? "off" : "on"}
          onSubmit={() => {
            try {
              if (remember) {
                localStorage.setItem(REMEMBER_KEY, "1");
                localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
              } else {
                localStorage.removeItem(REMEMBER_KEY);
                localStorage.removeItem(EMAIL_KEY);
              }
            } catch {
              /* ignore */
            }
            setPending(true);
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="micro-badge text-[10px] tracking-[0.14em] text-accent">EMAIL</span>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={emailLocked}
              onFocus={() => setEmailLocked(false)}
              autoComplete={isDev ? "one-time-code" : "username"}
              required
              className="h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="micro-badge text-[10px] tracking-[0.14em] text-accent">PASSWORD</span>
            <input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              readOnly={passwordLocked}
              onFocus={() => setPasswordLocked(false)}
              autoComplete={isDev ? "one-time-code" : "current-password"}
              required
              className="h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
            />
          </label>
          <p className="text-right text-[12.5px]">
            <Link href="/wholesaleportal/forgot-password" className="text-accent underline">
              Forgot password?
            </Link>
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-secondary">
            <input
              type="checkbox"
              name="remember"
              value="1"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent,#B08D3E)]"
            />
            Remember me for 30 days
          </label>
          {ok ? (
            <div className="rounded-chip border border-border bg-ground px-3 py-2.5 text-[12px] text-secondary">
              {ok}
            </div>
          ) : null}
          {error ? (
            <div className="flex items-center gap-2 text-[12px] text-danger">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-danger text-[9px]">!</span>
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className="mt-1 h-11 rounded-chip bg-ink text-[12.5px] font-semibold uppercase tracking-[0.14em] text-ground transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <GoogleSignInButton area="staff" remember={remember} />
      </div>
    </div>
  );
}
