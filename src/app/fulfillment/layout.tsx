import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { Clock } from "@/components/Clock";
import { logout } from "@/lib/actions/auth";

export default async function FulfillmentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== ROLE.FULFILLMENT) redirect("/login");

  return (
    <div className="min-h-screen bg-ful-ground text-white">
      <header className="flex h-[68px] items-center gap-6 border-b border-white/15 px-7">
        <span className="font-sans text-[16px] font-semibold tracking-[0.08em] text-ground">
          LUXE SUPPLY<span className="text-accent">*</span>
        </span>
        <span className="micro-badge rounded-full border border-accent/40 px-2.5 py-1 text-[10px] tracking-[0.14em] text-accent">
          FULFILLMENT · GENEVA VAULT
        </span>
        <div className="flex-1" />
        <Clock />
        <div className="flex items-center gap-2.5 text-[13px] text-white/80">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-ink">
            {session.initials}
          </div>
          {session.name}
        </div>
        <form action={logout}>
          <button className="rounded border border-white/25 px-3 py-2 text-[12px] text-white/70 transition hover:border-accent hover:text-ground">
            Sign out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
