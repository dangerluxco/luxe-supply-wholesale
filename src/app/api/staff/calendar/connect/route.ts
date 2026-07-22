import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/auth-session";
import { requireStaffSession } from "@/lib/staff-api-auth";
import {
  buildGoogleAuthorizeUrl,
  googleOAuthConfigured,
  signGoogleOAuthState,
} from "@/lib/googleOAuth";

export const dynamic = "force-dynamic";

/**
 * Start the Google Calendar connect round-trip (incremental consent):
 * calendar.events scope with offline access, pre-selecting the staffer's
 * login Google account. Lands back on `next` via the shared OAuth callback.
 *
 * GET /api/staff/calendar/connect?next=/wholesaleportal/rep/quotes/abc
 */
export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.redirect(
      new URL("/wholesaleportal/sign-in", publicOrigin(request)),
    );
  }
  if (!googleOAuthConfigured()) {
    return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const next = String(url.searchParams.get("next") || "/wholesaleportal/rep").trim();

  const state = signGoogleOAuthState({
    area: "staff",
    next: next.startsWith("/") ? next : "/wholesaleportal/rep",
    remember: false,
    purpose: "calendar",
  });
  const authorizeUrl = buildGoogleAuthorizeUrl({
    redirectUri: `${publicOrigin(request)}/api/auth/callback/google`,
    state,
    extraScopes: ["https://www.googleapis.com/auth/calendar.events"],
    accessType: "offline",
    prompt: "consent",
    loginHint: session.email,
  });
  return NextResponse.redirect(authorizeUrl);
}
