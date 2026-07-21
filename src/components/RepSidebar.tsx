"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { SearchIcon } from "@/components/icons";
import { OPEN_STAFF_SEARCH_EVENT } from "@/components/StaffCommandPalette";
import type { RepNavItem, RepNavIconKey } from "@/lib/rep-nav";
import { Logo } from "@/components/Logo";
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
 * Staff console left sidebar — client-side soft navigation via next/link.
 * The staff console has no server actions in its client graph (mutations go
 * through /api/staff/* fetch routes), so soft-nav is safe here.
 */
export function RepSidebar({
  user,
  nav,
  isManager = false,
}: {
  user: { name: string; initials: string };
  nav: RepNavItem[];
  isManager?: boolean;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/wholesaleportal/rep") {
      return pathname === "/wholesaleportal/rep" || pathname.startsWith("/wholesaleportal/rep?");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-white/10 bg-ink">
      <Link href="/wholesaleportal/rep" className="flex items-center gap-2 px-5 pt-6 pb-5">
        <Logo tone="light" height={26} priority />
      </Link>
      <div className="px-5 pb-4">
        <span className="micro-badge inline-block rounded-full border border-accent/40 px-2 py-1 text-[9px] tracking-[0.14em] text-accent">
          {isManager ? "MANAGER" : "REP CONSOLE"}
        </span>
      </div>

      <div className="px-3 pb-4">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_STAFF_SEARCH_EVENT))}
          className="flex w-full items-center gap-2 rounded-chip border border-white/15 px-3 py-2 text-[12px] text-white/50 transition hover:border-accent/60 hover:text-white/80"
        >
          <SearchIcon className="h-3.5 w-3.5 shrink-0" />
          <span>Search…</span>
          <span className="ml-auto rounded border border-white/15 px-1 py-0.5 font-mono text-[9.5px] text-white/40">
            ⌘K
          </span>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {nav.map((n) => {
          const Icon = ICONS[n.icon];
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "flex items-center gap-2.5 rounded-chip px-3 py-2 text-[12.5px] transition",
                active ? "bg-accent text-ink" : "text-white/60 hover:bg-white/5 hover:text-white/90",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {n.label}
            </Link>
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
        {/* Plain <a> + GET logout: hard-nav friendly; never leaves you on /api/logout. */}
        <a
          href="/api/logout?area=staff"
          className="pressable block w-full rounded-chip border border-white/20 px-2.5 py-1.5 text-center text-[11px] text-white/60 hover:border-accent hover:text-ground"
        >
          Sign out
        </a>
      </div>
    </aside>
  );
}
