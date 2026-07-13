import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { RepTopbar } from "@/components/RepTopbar";

export default async function RepLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    redirect("/wholesaleportal/sign-in");
  }

  return (
    <div className="min-h-screen bg-ground">
      <RepTopbar
        user={{ name: session.name, initials: session.initials }}
        isManager={session.role === ROLE.MANAGER}
      />
      {children}
    </div>
  );
}
