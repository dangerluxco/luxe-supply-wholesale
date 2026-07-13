import { NextResponse } from "next/server";
import { publicOrigin, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const referer = request.headers.get("referer") || "";
  const toBuyer = referer.includes("/wholesale") && !referer.includes("/wholesaleportal");
  const res = NextResponse.redirect(
    new URL(toBuyer ? "/wholesale/sign-in" : "/wholesaleportal/sign-in", publicOrigin(request)),
    303,
  );
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
