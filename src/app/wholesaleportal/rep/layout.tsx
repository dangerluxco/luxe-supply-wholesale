import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { RepSidebar } from "@/components/RepSidebar";
import { StaffCommandPalette } from "@/components/StaffCommandPalette";
import { StaffHardNav } from "@/components/StaffHardNav";
import { repNavItems } from "@/lib/rep-nav";

export default async function RepLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    redirect("/wholesaleportal/sign-in");
  }

  const isManager = session.role === ROLE.MANAGER;

  return (
    <div className="flex min-h-screen bg-ground">
      <StaffHardNav />
      <StaffCommandPalette />
      <RepSidebar
        user={{ name: session.name, initials: session.initials }}
        nav={repNavItems(isManager)}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
