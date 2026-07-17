import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  encodeSession,
  homeForRole,
  publicOrigin,
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionMaxAgeFromForm,
  withAreaSession,
} from "@/lib/auth-session";
import { authenticateBuyer } from "@/lib/firestore/buyers";
import { ROLE } from "@/lib/constants";
import { formField } from "@/lib/form";

export const dynamic = "force-dynamic";

function isAuthInfraError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || "");
  return /invalid_grant|invalid_rapt|Getting metadata|UNAUTHENTICATED|permission-denied|ECONNREFUSED|ENOTFOUND|unavailable/i.test(
    msg,
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  const username = (formField(form, "username") || formField(form, "email")).trim();
  const password = formField(form, "password");
  const cookieOpts = sessionCookieOptions(sessionMaxAgeFromForm(form));

  let auth: Awaited<ReturnType<typeof authenticateBuyer>> | null = null;
  let firestoreDown = false;
  try {
    auth = await authenticateBuyer(username, password);
  } catch (err) {
    firestoreDown = isAuthInfraError(err);
    console.warn(
      "[api/buyer-login] Firestore unavailable:",
      err instanceof Error ? err.message : err,
    );
  }

  if (auth?.ok) {
    const nextRaw = formField(form, "next").trim();
    const next =
      nextRaw.startsWith("/wholesale") && !nextRaw.startsWith("/wholesaleportal")
        ? nextRaw
        : homeForRole(ROLE.BUYER);
    const res = NextResponse.redirect(new URL(next, publicOrigin(request)), 303);
    const existingRaw = (await cookies()).get(SESSION_COOKIE)?.value;
    res.cookies.set(
      SESSION_COOKIE,
      withAreaSession(
        existingRaw,
        "buyer",
        encodeSession(auth.buyer.id, ROLE.BUYER, "firestore", auth.buyer.username),
      ),
      cookieOpts,
    );
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const nextRaw = formField(form, "next").trim();
  const nextQs =
    nextRaw.startsWith("/wholesale") && !nextRaw.startsWith("/wholesaleportal")
      ? `&next=${encodeURIComponent(nextRaw)}`
      : "";

  const message = firestoreDown
    ? "Sign-in temporarily unavailable (server credentials). Try again in a moment, or ask an admin to refresh local Google auth."
    : "Invalid username or password.";

  const res = NextResponse.redirect(
    new URL(
      `/wholesale/sign-in?error=${encodeURIComponent(message)}${nextQs}`,
      publicOrigin(request),
    ),
    303,
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
