import { cookies } from "next/headers";
import { prisma } from "./db";
import { ROLE, type Role } from "./constants";
import { getStaffById, initialsFromName } from "./firestore/staff";
import { getBuyerById } from "./firestore/buyers";
import {
  SESSION_COOKIE,
  decodeSession,
  type SessionUser,
  homeForRole,
  roleCanAccess,
  encodeSession,
  sessionCookieOptions,
} from "./auth-session";

export {
  SESSION_COOKIE,
  encodeSession,
  decodeSession,
  sessionCookieOptions,
  homeForRole,
  roleCanAccess,
  type SessionUser,
};

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const decoded = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!decoded) return null;

  try {
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
  } catch (err) {
    // Expired ADC / transient Firestore failures must not 500 every page that
    // touches getSession() — treat as signed-out until credentials recover.
    console.warn("[getSession] lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
