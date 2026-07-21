import { getSessionForArea, type SessionUser } from "@/lib/auth";
import { ROLE } from "@/lib/constants";

/**
 * Shared gate for buyer storefront API routes.
 * Must use the buyer cookie slot — /api/** skips middleware's x-app-area header,
 * so plain getSession() would incorrectly read the staff area.
 */
export async function requireBuyerSession(): Promise<SessionUser | null> {
  const session = await getSessionForArea("buyer");
  if (!session || session.source !== "firestore" || session.role !== ROLE.BUYER) {
    return null;
  }
  return session;
}
