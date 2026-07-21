import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  publicOrigin,
  SESSION_COOKIE,
  sessionCookieOptions,
  withoutAreaSession,
  type AppArea,
} from "@/lib/auth-session";

export const dynamic = "force-dynamic";

function resolveArea(request: Request): AppArea {
  const url = new URL(request.url);
  const fromQuery = String(url.searchParams.get("area") || "").trim();
  if (fromQuery === "buyer" || fromQuery === "staff" || fromQuery === "fulfillment") {
    return fromQuery;
  }

  const referer = request.headers.get("referer") || "";
  if (referer.includes("/wholesale") && !referer.includes("/wholesaleportal")) return "buyer";
  if (referer.includes("/fulfillment")) return "fulfillment";
  return "staff";
}

function signInPath(area: AppArea): string {
  if (area === "buyer") return "/wholesale/sign-in";
  if (area === "fulfillment") return "/wholesaleportal/sign-in";
  return "/wholesaleportal/sign-in";
}

async function clearAndRedirect(request: Request) {
  const area = resolveArea(request);
  const res = NextResponse.redirect(new URL(signInPath(area), publicOrigin(request)), 303);
  const existingRaw = (await cookies()).get(SESSION_COOKIE)?.value;
  res.cookies.set(SESSION_COOKIE, withoutAreaSession(existingRaw, area), sessionCookieOptions());
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Form POST from Sign out buttons. */
export async function POST(request: Request) {
  return clearAndRedirect(request);
}

/**
 * GET fallback — plain links / accidental form GET must not leave the browser
 * stuck on `/api/logout?`. Same clear + redirect as POST.
 */
export async function GET(request: Request) {
  return clearAndRedirect(request);
}
