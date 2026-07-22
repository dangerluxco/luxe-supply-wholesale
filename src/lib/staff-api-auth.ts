import { getSessionForArea, type SessionUser } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { staffTotpRedirectPath } from "@/lib/staff-totp-gate";

type StaffSessionOpts = {
  /** Allow managers mid-enrollment / mid-verify (2FA routes only). */
  allowPendingTotp?: boolean;
};

/**
 * Shared gate for staff API routes.
 * Uses the staff cookie slot explicitly — /api/** skips middleware's x-app-area.
 */
export async function requireStaffSession(opts: StaffSessionOpts = {}): Promise<SessionUser | null> {
  const session = await getSessionForArea("staff");
  if (
    !session ||
    session.source !== "firestore" ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    return null;
  }
  if (!opts.allowPendingTotp && staffTotpRedirectPath(session)) {
    return null;
  }
  return session;
}

export async function requireManagerSession(
  opts: StaffSessionOpts = {},
): Promise<SessionUser | null> {
  const session = await requireStaffSession(opts);
  if (!session || session.role !== ROLE.MANAGER) return null;
  return session;
}

/**
 * Gate for the fulfillment console + its APIs: a dedicated PPAS login
 * (FULFILLMENT role in the fulfillment cookie slot) OR an admin on their
 * staff session — reps are not allowed in.
 */
export async function requireFulfillmentAccess(): Promise<SessionUser | null> {
  const ful = await getSessionForArea("fulfillment");
  if (ful && ful.role === ROLE.FULFILLMENT) return ful;
  const staff = await requireStaffSession();
  return staff && staff.role === ROLE.MANAGER ? staff : null;
}
