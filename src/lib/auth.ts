import { cookies, headers } from "next/headers";
import { prisma } from "./db";
import { ROLE, type Role } from "./constants";
import { getStaffById, initialsFromName } from "./firestore/staff";
import { getBuyerById } from "./firestore/buyers";
import {
  SESSION_COOKIE,
  areaSessionFrom,
  areaForRole,
  decodeSession,
  type SessionUser,
  type AppArea,
  homeForRole,
  roleCanAccess,
  encodeSession,
  sessionCookieOptions,
  sessionMaxAgeFromForm,
  SESSION_REMEMBER_MAX_AGE,
  withAreaSession,
  withoutAreaSession,
} from "./auth-session";

export {
  SESSION_COOKIE,
  areaSessionFrom,
  areaForRole,
  encodeSession,
  decodeSession,
  sessionCookieOptions,
  sessionMaxAgeFromForm,
  SESSION_REMEMBER_MAX_AGE,
  withAreaSession,
  withoutAreaSession,
  homeForRole,
  roleCanAccess,
  type SessionUser,
  type AppArea,
};

/**
 * Which app area this request belongs to. Pages under /wholesale,
 * /wholesaleportal, /fulfillment get this from the `x-app-area` header
 * middleware injects. Route handlers under /api/** skip that middleware
 * matcher — prefer getSessionForArea() / requireBuyerSession /
 * requireStaffSession there instead of relying on this default.
 */
async function currentArea(): Promise<AppArea> {
  const hdrs = await headers();
  const area = hdrs.get("x-app-area");
  if (area === "buyer" || area === "staff" || area === "fulfillment") return area;
  return "staff";
}

async function resolveSessionUser(
  decoded: NonNullable<ReturnType<typeof decodeSession>>,
): Promise<SessionUser | null> {
  if (decoded.source === "firestore") {
    if (decoded.role === ROLE.BUYER) {
      const buyer = await getBuyerById(decoded.userId);
      if (!buyer || buyer.status === "disabled") return null;
      return {
        id: buyer.id,
        name: buyer.displayName || buyer.username,
        email: buyer.email,
        role: ROLE.BUYER,
        initials: initialsFromName(buyer.displayName || buyer.username || buyer.email),
        accountId: buyer.id,
        source: "firestore",
        username: buyer.username,
      };
    }

    const staff = await getStaffById(decoded.userId);
    if (!staff || staff.status === "disabled") return null;
    return {
      id: staff.id,
      name: staff.displayName,
      email: staff.email,
      role: staff.isAdmin ? ROLE.MANAGER : ROLE.REP,
      initials: initialsFromName(staff.displayName || staff.email),
      accountId: null,
      source: "firestore",
      totpEnabled: staff.totpEnabled,
      totpVerified: !!decoded.totpVerified,
    };
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    initials: user.initials,
    accountId: user.accountId,
    source: "prisma",
  };
}

/** Read the packed `__session` slot for an explicit area (buyer/staff/fulfillment). */
export async function getSessionForArea(area: AppArea): Promise<SessionUser | null> {
  const store = await cookies();
  const decoded = decodeSession(areaSessionFrom(store.get(SESSION_COOKIE)?.value, area));
  if (!decoded) return null;
  try {
    return await resolveSessionUser(decoded);
  } catch (err) {
    console.warn("[getSessionForArea] lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const area = await currentArea();
  return getSessionForArea(area);
}
