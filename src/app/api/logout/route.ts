import { NextResponse } from "next/server";
import {
  publicOrigin,
  SESSION_COOKIE,
  BUYER_SESSION_COOKIE,
  STAFF_SESSION_COOKIE,
  FULFILLMENT_SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const referer = request.headers.get("referer") || "";
  const toBuyer = referer.includes("/wholesale") && !referer.includes("/wholesaleportal");
  const res = NextResponse.redirect(
    new URL(toBuyer ? "/wholesale/sign-in" : "/wholesaleportal/sign-in", publicOrigin(request)),
    303,
  );
  // Only the cookie for the area you signed out of needs clearing, but
  // clearing all of them is harmless and avoids any stale-session edge case.
  const clearOpts = { ...sessionCookieOptions(0), maxAge: 0 };
  res.cookies.set(BUYER_SESSION_COOKIE, "", clearOpts);
  res.cookies.set(STAFF_SESSION_COOKIE, "", clearOpts);
  res.cookies.set(FULFILLMENT_SESSION_COOKIE, "", clearOpts);
  res.cookies.set(SESSION_COOKIE, "", clearOpts);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
