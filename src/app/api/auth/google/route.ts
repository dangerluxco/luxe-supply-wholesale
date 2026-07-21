import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/auth-session";
import {
  buildGoogleAuthorizeUrl,
  googleOAuthConfigured,
  googleOAuthStaffHostedDomain,
  signGoogleOAuthState,
} from "@/lib/googleOAuth";

export const dynamic = "force-dynamic";

/**
 * Start Google OAuth (authorization-code redirect) — mirrors eelo HQ's
 * "Sign in with Google" button, which POSTs/GETs into Auth.js and lands on
 * /api/auth/callback/google. We keep our own `__session` cookie on callback
 * instead of adopting NextAuth sessions (Firebase Hosting single-cookie rule).
 *
 * GET /api/auth/google?area=staff|buyer&remember=1&next=/wholesale
 */
export async function GET(request: Request) {
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/wholesaleportal/sign-in?error=Google+sign-in+is+not+configured.", publicOrigin(request)),
    );
  }

  const url = new URL(request.url);
  const areaRaw = String(url.searchParams.get("area") || "").trim();
  const area = areaRaw === "staff" || areaRaw === "buyer" ? areaRaw : null;
  if (!area) {
    return NextResponse.json({ error: "Missing area." }, { status: 400 });
  }

  const remember =
    url.searchParams.get("remember") === "1" ||
    url.searchParams.get("remember") === "true" ||
    url.searchParams.get("remember") === "on";
  const next = String(url.searchParams.get("next") || "").trim();

  const state = signGoogleOAuthState({ area, next, remember });
  const redirectUri = `${publicOrigin(request)}/api/auth/callback/google`;
  const hostedDomain = area === "staff" ? googleOAuthStaffHostedDomain() || undefined : undefined;

  const authorizeUrl = buildGoogleAuthorizeUrl({ redirectUri, state, hostedDomain });
  return NextResponse.redirect(authorizeUrl);
}
