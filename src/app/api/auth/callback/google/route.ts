import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  encodeSession,
  homeForRole,
  publicOrigin,
  SESSION_COOKIE,
  SESSION_REMEMBER_MAX_AGE,
  sessionCookieOptions,
  withAreaSession,
} from "@/lib/auth-session";
import { exchangeGoogleAuthCode, verifyGoogleOAuthState } from "@/lib/googleOAuth";
import { authenticateStaffByOAuthEmail, staffToAppRole } from "@/lib/firestore/staff";
import { authenticateBuyerByOAuthEmail } from "@/lib/firestore/buyers";
import { ROLE } from "@/lib/constants";

export const dynamic = "force-dynamic";

function signInErrorRedirect(origin: string, area: "staff" | "buyer", message: string) {
  const path = area === "staff" ? "/wholesaleportal/sign-in" : "/wholesale/sign-in";
  const url = new URL(path, origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

/**
 * Google OAuth callback — same path Auth.js uses (`/api/auth/callback/google`)
 * so the GCP OAuth client's Authorized redirect URIs match eelo's convention.
 */
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const url = new URL(request.url);
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");

  let area: "staff" | "buyer" = "staff";
  try {
    if (err) {
      return signInErrorRedirect(origin, area, "Google sign-in was cancelled.");
    }
    if (!code || !stateRaw) {
      return signInErrorRedirect(origin, area, "Google sign-in failed. Try again.");
    }

    const state = verifyGoogleOAuthState(stateRaw);
    area = state.area;

    const redirectUri = `${origin}/api/auth/callback/google`;
    const verified = await exchangeGoogleAuthCode({ code, redirectUri });

    const cookieOpts = sessionCookieOptions(state.remember ? SESSION_REMEMBER_MAX_AGE : undefined);
    const existingRaw = (await cookies()).get(SESSION_COOKIE)?.value;

    if (area === "staff") {
      const auth = await authenticateStaffByOAuthEmail(verified.email);
      if (!auth.ok) {
        return signInErrorRedirect(
          origin,
          "staff",
          auth.reason === "disabled"
            ? "This staff account is disabled."
            : "No staff account matches that Google email. Ask a manager to invite you first.",
        );
      }
      const role = staffToAppRole(auth.staff);
      const res = NextResponse.redirect(new URL(homeForRole(role), origin));
      res.cookies.set(
        SESSION_COOKIE,
        withAreaSession(existingRaw, "staff", encodeSession(auth.staff.id, role, "firestore")),
        cookieOpts,
      );
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    const auth = await authenticateBuyerByOAuthEmail(verified.email);
    if (!auth.ok) {
      return signInErrorRedirect(
        origin,
        "buyer",
        auth.reason === "disabled"
          ? "This account is disabled."
          : "No wholesale account matches that Google email. Request access first.",
      );
    }
    const next =
      state.next.startsWith("/wholesale") && !state.next.startsWith("/wholesaleportal")
        ? state.next
        : homeForRole(ROLE.BUYER);
    const res = NextResponse.redirect(new URL(next, origin));
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
  } catch (e) {
    console.warn("[auth/callback/google]", e instanceof Error ? e.message : e);
    return signInErrorRedirect(origin, area, "Google sign-in could not be verified. Try again.");
  }
}
