import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { firstSettingsSection } from "@/lib/settings-sections";

export async function requireSettingsSession(opts?: { managerOnly?: boolean }) {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    redirect("/wholesaleportal/sign-in");
  }
  const isManager = session.role === ROLE.MANAGER;
  if (opts?.managerOnly && !isManager) {
    redirect(firstSettingsSection(false).href);
  }
  return { session, isManager };
}
