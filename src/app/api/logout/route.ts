import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  publicOrigin,
  SESSION_COOKIE,
  sessionCookieOptions,
  withoutAreaSession,
} from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const referer = request.headers.get("referer") || "";
  const toBuyer = referer.includes("/wholesale") && !referer.includes("/wholesaleportal");
  const res = NextResponse.redirect(
    new URL(toBuyer ? "/wholesale/sign-in" : "/wholesaleportal/sign-in", publicOrigin(request)),
    303,
  );
  // Only drop the area you actually signed out of — other areas' sessions stay
  // packed into the same shared `__session` cookie (see auth-session.ts).
  const existingRaw = (await cookies()).get(SESSION_COOKIE)?.value;
  const area = toBuyer ? "buyer" : "staff";
  res.cookies.set(SESSION_COOKIE, withoutAreaSession(existingRaw, area), sessionCookieOptions());
  res.headers.set("Cache-Control", "no-store");
  return res;
}
