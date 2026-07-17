import { NextRequest, NextResponse } from "next/server";
import { decodeSession, roleCanAccess, SESSION_COOKIE } from "@/lib/auth-session";
import { ROLE } from "@/lib/constants";

function signInForArea(isBuyer: boolean): string {
  return isBuyer ? "/wholesale/sign-in" : "/wholesaleportal/sign-in";
}

/** Catalog + PDP are public (prices gated in UI). Cart/account/orders stay auth'd. */
function isPublicBuyerPath(pathname: string): boolean {
  if (pathname === "/wholesale" || pathname === "/wholesale/") return true;
  if (pathname.startsWith("/wholesale/sign-in")) return true;
  if (pathname.startsWith("/wholesale/register")) return true;
  if (pathname.startsWith("/wholesale/product/")) return true;
  if (pathname.startsWith("/wholesale/forgot-password")) return true;
  if (pathname.startsWith("/wholesale/reset-password")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/wholesaleportal/sign-in") ||
    pathname.startsWith("/wholesaleportal/login") ||
    pathname.startsWith("/wholesaleportal/forgot-password") ||
    pathname.startsWith("/wholesaleportal/reset-password") ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  const isBuyer = pathname.startsWith("/wholesale") && !pathname.startsWith("/wholesaleportal");
  const isStaff = pathname.startsWith("/wholesaleportal");
  const isFulfillment = pathname.startsWith("/fulfillment");
  if (!isBuyer && !isStaff && !isFulfillment) return NextResponse.next();

  // Public buyer browse — no login required
  if (isBuyer && isPublicBuyerPath(pathname)) {
    return NextResponse.next();
  }

  const session = decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = signInForArea(isBuyer);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!roleCanAccess(session.role, pathname)) {
    // Staff on gated buyer routes → buyer sign-in; never bounce to rep home
    if (isBuyer) {
      const url = req.nextUrl.clone();
      url.pathname = "/wholesale/sign-in";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    const url = req.nextUrl.clone();
    url.pathname = signInForArea(false);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Extra: gated wholesale paths require BUYER explicitly
  if (isBuyer && session.role !== ROLE.BUYER) {
    const url = req.nextUrl.clone();
    url.pathname = "/wholesale/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/wholesale",
    "/wholesale/:path*",
    "/wholesaleportal",
    "/wholesaleportal/:path*",
    "/fulfillment/:path*",
  ],
};
