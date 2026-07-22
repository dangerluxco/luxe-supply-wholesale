import { redirect } from "next/navigation";
import { getSessionForArea } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { Clock } from "@/components/Clock";
import { Logo } from "@/components/Logo";
import { listInvoices } from "@/lib/firestore/invoices";
import { FulfillmentSidebar, type SidebarShipment } from "@/components/FulfillmentSidebar";

/**
 * Dark warehouse console shell. Access: dedicated PPAS logins (FULFILLMENT
 * role, own cookie slot) or an admin on their staff session — reps stay out.
 */
export default async function FulfillmentLayout({ children }: { children: React.ReactNode }) {
  const ful = await getSessionForArea("fulfillment");
  const staff = ful?.role === ROLE.FULFILLMENT ? null : await getSessionForArea("staff");
  const session =
    ful?.role === ROLE.FULFILLMENT
      ? ful
      : staff && staff.role === ROLE.MANAGER
        ? staff
        : null;
  if (!session) redirect("/wholesaleportal/sign-in?next=/fulfillment");

  const shipments: SidebarShipment[] = (await listInvoices({ limit: 300 }).catch(() => [])).map(
    (inv) => ({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      buyer: inv.customerName || inv.buyerDisplayName || inv.customerCompany || "—",
      itemCount: inv.itemCount,
      shipped: inv.fulfillmentStatus === "SHIPPED",
    }),
  );

  return (
    <div className="min-h-screen bg-[#131316] text-white">
      <header className="flex h-[68px] items-center gap-6 border-b border-white/15 px-7">
        <Logo tone="light" height={28} priority />
        <span className="micro-badge rounded-full border border-accent/40 px-2.5 py-1 text-[10px] tracking-[0.14em] text-accent">
          FULFILLMENT
        </span>
        <div className="flex-1" />
        <Clock />
        <div className="flex items-center gap-2.5 text-[13px] text-white/80">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-ink">
            {session.initials}
          </div>
          {session.name}
        </div>
        {session.role !== ROLE.FULFILLMENT ? (
          <a
            href="/wholesaleportal/rep"
            className="rounded border border-white/25 px-3 py-2 text-[12px] text-white/70 transition hover:border-accent hover:text-ground"
          >
            Back to portal
          </a>
        ) : (
          <a
            href="/api/logout?area=fulfillment"
            className="rounded border border-white/25 px-3 py-2 text-[12px] text-white/70 transition hover:border-accent hover:text-ground"
          >
            Sign out
          </a>
        )}
      </header>
      <div className="flex">
        <FulfillmentSidebar shipments={shipments} />
        <main className="min-w-0 flex-1 px-6 py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
