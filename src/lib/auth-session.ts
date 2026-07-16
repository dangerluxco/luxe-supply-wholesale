import { ROLE, type Role } from "./constants";

/** Firebase Hosting only forwards this cookie name to Cloud Run. */
export const SESSION_COOKIE = "__session";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  initials: string;
  accountId: string | null;
  source: "firestore" | "prisma";
  /** Buyer username when role is BUYER (Firestore portal login). */
  username?: string | null;
};

// Cookie payload: base64("source|userId|role") — optional 4th: username
export function encodeSession(
  userId: string,
  role: string,
  source: "firestore" | "prisma" = "prisma",
  username?: string,
): string {
  const parts = [source, userId, role];
  if (username) parts.push(username);
  return Buffer.from(parts.join("|")).toString("base64");
}

export function decodeSession(
  value: string | undefined,
): { userId: string; role: string; source: "firestore" | "prisma"; username?: string } | null {
  if (!value) return null;
  try {
    const parts = Buffer.from(value, "base64").toString("utf8").split("|");
    if (parts.length === 2) {
      const [userId, role] = parts;
      if (!userId || !role) return null;
      return { userId, role, source: "prisma" };
    }
    const [source, userId, role, username] = parts;
    if (!userId || !role) return null;
    if (source !== "firestore" && source !== "prisma") return null;
    return { userId, role, source, username };
  } catch {
    return null;
  }
}

export function cookiePath(): string {
  return "/";
}

/** Public site origin for redirects (Hosting in prod, localhost in dev). */
export function publicOrigin(request: Request): string {
  const hostHeader =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    process.env.PUBLIC_HOST ||
    "photography-964f5.web.app";
  const host = hostHeader.split(",")[0]!.trim();
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto =
    request.headers.get("x-forwarded-proto") || (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

/** Persistent login when "Remember me" is checked (~30 days). */
export const SESSION_REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;

/** Default login without remember — one browser session (cleared on close). */
export function sessionCookieOptions(maxAge?: number) {
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: cookiePath(),
    secure: process.env.NODE_ENV === "production",
  };
  if (maxAge === undefined) return base;
  return { ...base, maxAge };
}

/** Resolve cookie lifetime from a login form's remember checkbox. */
export function sessionMaxAgeFromForm(form: FormData): number | undefined {
  const raw = form.get("remember");
  if (raw == null) return undefined;
  const v = String(raw).trim().toLowerCase();
  if (v === "1" || v === "on" || v === "true" || v === "yes") {
    return SESSION_REMEMBER_MAX_AGE;
  }
  return undefined;
}

export function homeForRole(role: string): string {
  switch (role) {
    case ROLE.BUYER:
      return "/wholesale";
    case ROLE.REP:
    case ROLE.MANAGER:
      return "/wholesaleportal/rep";
    case ROLE.FULFILLMENT:
      return "/fulfillment";
    default:
      return "/wholesaleportal/sign-in";
  }
}

export function roleCanAccess(role: string, pathname: string): boolean {
  if (pathname.startsWith("/wholesale") && !pathname.startsWith("/wholesaleportal")) {
    return role === ROLE.BUYER;
  }
  if (pathname.startsWith("/wholesaleportal")) {
    return role === ROLE.REP || role === ROLE.MANAGER;
  }
  if (pathname.startsWith("/fulfillment")) return role === ROLE.FULFILLMENT;
  return true;
}
