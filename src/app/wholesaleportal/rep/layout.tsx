import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { RepSidebar } from "@/components/RepSidebar";
import { StaffCommandPalette } from "@/components/StaffCommandPalette";
import { repNavItems } from "@/lib/rep-nav";
import { staffTotpRedirectPath } from "@/lib/staff-totp-gate";
import { getPortalFeatures } from "@/lib/firestore/settings";

export default async function RepLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    redirect("/wholesaleportal/sign-in");
  }

  const totpPath = staffTotpRedirectPath(session);
  if (totpPath) redirect(totpPath);

  const isManager = session.role === ROLE.MANAGER;
  const features = await getPortalFeatures().catch(() => ({
    leads: true,
    wishlist: true,
    performance: true,
    curation: true,
  }));

  return (
    <div className="flex min-h-screen bg-ground">
      <StaffCommandPalette />
      <RepSidebar
        user={{ name: session.name, initials: session.initials }}
        nav={repNavItems(isManager, features)}
        isManager={isManager}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
