import { ROLE, type Role } from "./constants";

/**
 * Firebase Hosting's rewrite proxy to Cloud Run strips every `Set-Cookie` header
 * from the response EXCEPT one named exactly `__session` (see
 * https://firebase.google.com/docs/hosting/manage-cache#using_cookies). Any other
 * cookie name gets silently dropped in production — the login POST succeeds and
 * the browser gets redirected, but the session cookie never actually arrives, so
 * the very next request looks signed-out and bounces back to sign-in. That bit
 * us once already (per-area cookie names `__session_buyer`/`__session_staff`/
 * `__session_fulfillment` worked great locally, since there's no Hosting proxy in
 * dev, but broke every login in production).
 *
 * So there is exactly ONE cookie, always named `__session`. Area isolation (so
 * signing into the staff portal doesn't log you out of the buyer storefront, and
 * vice versa) is enforced by packing each area's encoded session into its own key
 * inside the cookie's JSON payload, rather than by giving each area its own
 * cookie name.
 */
export const SESSION_COOKIE = "__session";

export type AppArea = "buyer" | "staff" | "fulfillment";

export function areaForRole(role: string): AppArea {
  if (role === ROLE.BUYER) return "buyer";
  if (role === ROLE.FULFILLMENT) return "fulfillment";
  return "staff";
}

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
  /** Manager completed TOTP challenge for this browser session. */
  totpVerified?: boolean;
  /** Manager has TOTP enrolled on their staff record. */
  totpEnabled?: boolean;
};

export type EncodeSessionOpts = {
  username?: string;
  totpVerified?: boolean;
};

// Per-area payload: base64("source|userId|role[|username][|t1]")
export function encodeSession(
  userId: string,
  role: string,
  source: "firestore" | "prisma" = "prisma",
  usernameOrOpts?: string | EncodeSessionOpts,
  maybeOpts?: EncodeSessionOpts,
): string {
  const opts: EncodeSessionOpts =
    typeof usernameOrOpts === "object" && usernameOrOpts
      ? usernameOrOpts
      : { ...(maybeOpts || {}), username: typeof usernameOrOpts === "string" ? usernameOrOpts : undefined };
  const parts = [source, userId, role];
  if (opts.username) parts.push(opts.username);
  if (opts.totpVerified) {
    if (!opts.username) parts.push("");
    parts.push("t1");
  }
  return Buffer.from(parts.join("|")).toString("base64");
}

export function decodeSession(
  value: string | undefined,
): {
  userId: string;
  role: string;
  source: "firestore" | "prisma";
  username?: string;
  totpVerified?: boolean;
} | null {
  if (!value) return null;
  try {
    const parts = Buffer.from(value, "base64").toString("utf8").split("|");
    if (parts.length === 2) {
      const [userId, role] = parts;
      if (!userId || !role) return null;
      return { userId, role, source: "prisma" };
    }
    const [source, userId, role, a, b] = parts;
    if (!userId || !role) return null;
    if (source !== "firestore" && source !== "prisma") return null;
    let username: string | undefined;
    let totpVerified = false;
    if (b === "t1") {
      totpVerified = true;
      username = a || undefined;
    } else if (a === "t1") {
      totpVerified = true;
    } else if (a) {
      username = a;
    }
    return { userId, role, source, username, totpVerified };
  } catch {
    return null;
  }
}

type CombinedPayload = Partial<Record<AppArea, string>>;

function decodeCombined(raw: string | undefined): CombinedPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    const out: CombinedPayload = {};
    (["buyer", "staff", "fulfillment"] as const).forEach((area) => {
      const v = (parsed as Record<string, unknown>)[area];
      if (typeof v === "string" && v) out[area] = v;
    });
    return out;
  } catch {
    return {};
  }
}

function encodeCombined(payload: CombinedPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/** Pull one area's encoded per-area session string out of the shared cookie's value. */
export function areaSessionFrom(raw: string | undefined, area: AppArea): string | undefined {
  return decodeCombined(raw)[area];
}

/** Merge a freshly-encoded area session into whatever `__session` value the browser already sent — preserves the other areas' sessions. */
export function withAreaSession(
  existingRaw: string | undefined,
  area: AppArea,
  encodedAreaSession: string,
): string {
  const combined = decodeCombined(existingRaw);
  combined[area] = encodedAreaSession;
  return encodeCombined(combined);
}

/** Drop one area's session while leaving any other areas' sessions in the shared cookie intact. */
export function withoutAreaSession(existingRaw: string | undefined, area: AppArea): string {
  const combined = decodeCombined(existingRaw);
  delete combined[area];
  return encodeCombined(combined);
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
