import { getSession, type SessionUser } from "@/lib/auth";
import { ROLE } from "@/lib/constants";

/** Shared gate for staff API routes (Firestore-backed REP/MANAGER). */
export async function requireStaffSession(): Promise<SessionUser | null> {
  const session = await getSession();
  if (
    !session ||
    session.source !== "firestore" ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    return null;
  }
  return session;
}
