import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  encodeSession,
  homeForRole,
  SESSION_COOKIE,
  SESSION_REMEMBER_MAX_AGE,
  sessionCookieOptions,
  withAreaSession,
} from "@/lib/auth-session";
import { verifyGoogleIdToken } from "@/lib/googleOAuth";
import { authenticateStaffByOAuthEmail, staffToAppRole } from "@/lib/firestore/staff";
import { authenticateBuyerByOAuthEmail } from "@/lib/firestore/buyers";
import { ROLE } from "@/lib/constants";
import { staffPostLoginPath } from "@/lib/staff-totp-gate";

export const dynamic = "force-dynamic";

type Body = {
  credential?: string;
  area?: string;
  next?: string;
  remember?: boolean;
};

/**
 * Legacy GIS One Tap credential POST. Prefer the Auth.js-style redirect at
 * GET /api/auth/google → /api/auth/callback/google (same as hq.eelolive.com).
 * Kept so older clients still work; new UI no longer calls this.
 */
export async function POST(request: Request) {
  if (!String(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const area = body.area === "staff" ? "staff" : body.area === "buyer" ? "buyer" : null;
  if (!area || !body.credential) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  let email: string;
  try {
    const verified = await verifyGoogleIdToken(body.credential);
    email = verified.email;
  } catch (err) {
    console.warn("[oauth/google] token verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Google sign-in could not be verified. Try again." }, { status: 401 });
  }

  const cookieOpts = sessionCookieOptions(body.remember === false ? undefined : SESSION_REMEMBER_MAX_AGE);
  const existingRaw = (await cookies()).get(SESSION_COOKIE)?.value;
  const nextRaw = String(body.next || "").trim();

  try {
    if (area === "staff") {
      const auth = await authenticateStaffByOAuthEmail(email);
      if (!auth.ok) {
        return NextResponse.json(
          {
            error:
              auth.reason === "disabled"
                ? "This staff account is disabled."
                : "No staff account matches that Google email. Ask a manager to invite you first.",
          },
          { status: 403 },
        );
      }
      const role = staffToAppRole(auth.staff);
      const dest = staffPostLoginPath({
        role,
        totpEnabled: auth.staff.totpEnabled,
        home: homeForRole(role),
      });
      const res = NextResponse.json({ ok: true, redirect: dest });
      res.cookies.set(
        SESSION_COOKIE,
        withAreaSession(existingRaw, "staff", encodeSession(auth.staff.id, role, "firestore")),
        cookieOpts,
      );
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    const auth = await authenticateBuyerByOAuthEmail(email);
    if (!auth.ok) {
      return NextResponse.json(
        {
          error:
            auth.reason === "disabled"
              ? "This account is disabled."
              : "No wholesale account matches that Google email. Request access first.",
        },
        { status: 403 },
      );
    }
    const next =
      nextRaw.startsWith("/wholesale") && !nextRaw.startsWith("/wholesaleportal")
        ? nextRaw
        : homeForRole(ROLE.BUYER);
    const res = NextResponse.json({ ok: true, redirect: next });
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
  } catch (err) {
    console.warn("[oauth/google] account lookup failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Sign-in temporarily unavailable. Try again in a moment." },
      { status: 503 },
    );
  }
}
