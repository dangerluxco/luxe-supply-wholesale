import { getSession, type SessionUser } from "@/lib/auth";
import { ROLE } from "@/lib/constants";

/** Shared gate for buyer storefront API routes (Firestore-backed BUYER). */
export async function requireBuyerSession(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session || session.source !== "firestore" || session.role !== ROLE.BUYER) {
    return null;
  }
  return session;
}
