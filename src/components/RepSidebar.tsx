"use client";

import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import type { RepNavItem, RepNavIconKey } from "@/lib/rep-nav";
import {
  DashboardIcon,
  OrderRequestsIcon,
  LeadsIcon,
  ClientsIcon,
  CatalogIcon,
  BundlesIcon,
  CurationIcon,
  InvoicesIcon,
  WishlistIcon,
  PerformanceIcon,
  StaffIcon,
  SettingsIcon,
} from "@/components/repIcons";

const ICONS: Record<RepNavIconKey, (props: { className?: string }) => React.ReactNode> = {
  dashboard: DashboardIcon,
  orderRequests: OrderRequestsIcon,
  leads: LeadsIcon,
  clients: ClientsIcon,
  catalog: CatalogIcon,
  bundles: BundlesIcon,
  curation: CurationIcon,
  invoices: InvoicesIcon,
  wishlist: WishlistIcon,
  performance: PerformanceIcon,
  staff: StaffIcon,
  settings: SettingsIcon,
};

/**
 * Staff console left sidebar — plain <a> hard navigations (not next/link
 * soft-nav). Soft-nav between pages that still embed server-action stubs can
 * throw webpack "reading 'call'" in Next 15 — hard nav avoids that entirely.
 * StaffHardNav (mounted once in the layout) intercepts these clicks globally.
 */
export function RepSidebar({
  user,
  nav,
}: {
  user: { name: string; initials: string };
  nav: RepNavItem[];
}) {
  const pathname = usePathname();
  const isManager = nav.some((n) => n.href === "/wholesaleportal/rep/staff");

  function isActive(href: string) {
    if (href === "/wholesaleportal/rep") {
      return pathname === "/wholesaleportal/rep" || pathname.startsWith("/wholesaleportal/rep?");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-white/10 bg-ink">
      <a href="/wholesaleportal/rep" className="flex items-center gap-2 px-5 pt-6 pb-5">
        <span className="font-sans text-[15px] font-semibold tracking-[0.06em] text-ground">
          LUXE SUPPLY<span className="text-accent">*</span>
        </span>
      </a>
      <div className="px-5 pb-5">
        <span className="micro-badge inline-block rounded-full border border-accent/40 px-2 py-1 text-[9px] tracking-[0.14em] text-accent">
          {isManager ? "MANAGER" : "REP CONSOLE"}
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {nav.map((n) => {
          const Icon = ICONS[n.icon];
          const active = isActive(n.href);
          return (
            <a
              key={n.href}
              href={n.href}
              className={clsx(
                "flex items-center gap-2.5 rounded-chip px-3 py-2 text-[12.5px] transition",
                active ? "bg-accent text-ink" : "text-white/60 hover:bg-white/5 hover:text-white/90",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {n.label}
            </a>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-3 flex items-center gap-2.5 px-2 text-[12px] text-white/70">
          <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-ink">
            {user.initials}
          </div>
          <span className="truncate">{user.name}</span>
        </div>
        <form method="POST" action="/api/logout">
          <button className="w-full rounded-chip border border-white/20 px-2.5 py-1.5 text-[11px] text-white/60 transition hover:border-accent hover:text-ground">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
