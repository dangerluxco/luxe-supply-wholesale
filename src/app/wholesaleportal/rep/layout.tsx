import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { RepSidebar } from "@/components/RepSidebar";
import { StaffCommandPalette } from "@/components/StaffCommandPalette";
import { repNavItems, type RepNavItem } from "@/lib/rep-nav";
import { getRepNavCounts } from "@/lib/repNavCounts";
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
  const [features, counts] = await Promise.all([
    getPortalFeatures().catch(() => ({
      leads: true,
      wishlist: true,
      performance: true,
      curation: true,
    })),
    getRepNavCounts(),
  ]);

  // Attention pills so new work is visible from any page, not just the dashboard.
  const nav: RepNavItem[] = repNavItems(isManager, features).map((n) => {
    if (n.icon === "orderRequests" && counts.openRequests > 0) {
      return { ...n, badge: counts.openRequests, badgeTone: "accent" };
    }
    if (n.icon === "clients" && counts.pendingApplications > 0) {
      return { ...n, badge: counts.pendingApplications, badgeTone: "accent" };
    }
    if (n.icon === "invoices" && counts.overdueInvoices > 0) {
      return { ...n, badge: counts.overdueInvoices, badgeTone: "danger" };
    }
    return n;
  });

  return (
    <div className="flex min-h-screen bg-ground">
      <StaffCommandPalette />
      <RepSidebar
        user={{ name: session.name, initials: session.initials }}
        nav={nav}
        isManager={isManager}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
