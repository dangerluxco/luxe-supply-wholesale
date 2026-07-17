"use client";

import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import type { RepNavItem } from "@/lib/rep-nav";

/**
 * Staff top nav uses plain <a> hard navigations (not next/link soft-nav).
 * Soft-nav between pages that still embed server-action stubs can throw
 * webpack "reading 'call'" in Next 15 — hard nav avoids that entirely.
 */
export function RepTopbar({
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
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-9 border-b border-white/10 bg-ink/95 px-10 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.55)] backdrop-blur-md">
      <a href="/wholesaleportal/rep" className="flex items-center gap-2.5">
        <span className="font-sans text-[16px] font-semibold tracking-[0.08em] text-ground">
          LUXE SUPPLY<span className="text-accent">*</span>
        </span>
        <span className="micro-badge rounded-full border border-accent/40 px-2 py-1 text-[9px] tracking-[0.14em] text-accent">
          {isManager ? "MANAGER" : "REP CONSOLE"}
        </span>
      </a>
      <nav className="flex gap-6 text-[12px] text-white/55">
        {nav.map((n) => (
          <a
            key={n.href}
            href={n.href}
            className={clsx(
              "pb-0.5 transition",
              isActive(n.href)
                ? "border-b-[1.5px] border-accent text-ground"
                : "hover:text-white/90",
            )}
          >
            {n.label}
          </a>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 text-[12px] text-white/70">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-ink">
          {user.initials}
        </div>
        {user.name}
      </div>
      <form method="POST" action="/api/logout">
        <button className="rounded-chip border border-white/20 px-2.5 py-1.5 text-[11px] text-white/60 transition hover:border-accent hover:text-ground">
          Sign out
        </button>
      </form>
    </header>
  );
}
