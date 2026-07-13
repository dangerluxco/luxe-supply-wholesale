"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
export function RepTopbar({
  user,
  isManager,
}: {
  user: { name: string; initials: string };
  isManager: boolean;
}) {
  const pathname = usePathname();

  const nav = [
    { label: "Invoice Requests", href: "/wholesaleportal/rep" },
    { label: "Clients", href: "/wholesaleportal/rep/clients" },
    { label: "Catalog", href: "/wholesaleportal/rep/catalog" },
    { label: "Bundles", href: "/wholesaleportal/rep/bundles" },
    { label: "Invoices", href: "/wholesaleportal/rep/invoices" },
    { label: "Wishlist", href: "/wholesaleportal/rep/wishlist" },
    ...(isManager ? [{ label: "Performance", href: "/wholesaleportal/rep/performance" }] : []),
    { label: "Settings", href: "/wholesaleportal/rep/settings" },
  ];

  function isActive(href: string) {
    if (href === "/wholesaleportal/rep") {
      return pathname === "/wholesaleportal/rep" || pathname.startsWith("/wholesaleportal/rep?");
    }
    return pathname.startsWith(href);
  }

  return (
    <header className="flex h-16 items-center gap-9 border-b border-white/10 bg-ink px-10">
      <Link href="/wholesaleportal/rep" className="flex items-center gap-2.5">
        <span className="font-sans text-[16px] font-semibold tracking-[0.08em] text-ground">
          LUXE SUPPLY<span className="text-accent">*</span>
        </span>
        <span className="micro-badge rounded-full border border-accent/40 px-2 py-1 text-[9px] tracking-[0.14em] text-accent">
          {isManager ? "MANAGER" : "REP CONSOLE"}
        </span>
      </Link>
      <nav className="flex gap-6 text-[12px] text-white/55">
        {nav.map((n) => (
          <Link
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
          </Link>
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
