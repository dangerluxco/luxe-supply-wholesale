import { ROLE } from "@/lib/constants";
import type { SessionUser } from "@/lib/auth-session";

/** Path managers must visit before using the staff portal (enroll or verify). */
export function staffTotpRedirectPath(session: Pick<SessionUser, "role" | "totpEnabled" | "totpVerified">): string | null {
  if (session.role !== ROLE.MANAGER) return null;
  if (!session.totpEnabled) return "/wholesaleportal/security/2fa?mode=enroll";
  if (!session.totpVerified) return "/wholesaleportal/security/2fa?mode=verify";
  return null;
}

export function staffPostLoginPath(opts: {
  role: string;
  totpEnabled: boolean;
  home: string;
}): string {
  if (opts.role !== ROLE.MANAGER) return opts.home;
  if (!opts.totpEnabled) return "/wholesaleportal/security/2fa?mode=enroll";
  return "/wholesaleportal/security/2fa?mode=verify";
}
