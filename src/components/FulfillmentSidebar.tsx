"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";

export type SidebarShipment = {
  invoiceId: string;
  invoiceNumber: string;
  buyer: string;
  itemCount: number;
  shipped: boolean;
};

/**
 * Persistent left nav for the fulfillment console — shippers jump between
 * shipments without leaving the pack station (CEO's cross-order workflow).
 */
export function FulfillmentSidebar({ shipments }: { shipments: SidebarShipment[] }) {
  const pathname = usePathname();
  const open = shipments.filter((s) => !s.shipped);
  const recent = shipments.filter((s) => s.shipped).slice(0, 6);

  function row(s: SidebarShipment) {
    const href = `/fulfillment/${s.invoiceId}`;
    const active = pathname === href;
    return (
      <Link
        key={s.invoiceId}
        href={href}
        className={clsx(
          "block rounded-chip px-3 py-2 transition",
          active ? "bg-accent text-ink" : "text-white/70 hover:bg-white/10 hover:text-white",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[12px] font-semibold">{s.invoiceNumber}</span>
          <span className={clsx("font-mono text-[10px]", active ? "text-ink/70" : "text-white/40")}>
            {s.itemCount} pc{s.itemCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className={clsx("truncate text-[11px]", active ? "text-ink/80" : "text-white/50")}>
          {s.buyer}
        </div>
      </Link>
    );
  }

  return (
    <aside className="hidden w-[230px] shrink-0 border-r border-white/10 lg:block">
      <div className="sticky top-0 max-h-screen overflow-y-auto px-3 py-6">
        <div className="mb-4 space-y-1">
          {[
            { href: "/fulfillment", label: "⬒ Queue overview" },
            { href: "/fulfillment/shipped", label: "➤ Shipped" },
            { href: "/fulfillment/eod", label: "☰ End of day" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "block rounded-chip px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition",
                pathname === l.href
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white",
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="micro-badge mb-2 px-3 text-[9.5px] tracking-[0.14em] text-accent">
          TO SHIP ({open.length})
        </div>
        <div className="space-y-1">
          {open.length ? open.map(row) : (
            <p className="px-3 text-[11px] text-white/40">Nothing waiting.</p>
          )}
        </div>

        {recent.length ? (
          <>
            <div className="micro-badge mb-2 mt-6 px-3 text-[9.5px] tracking-[0.14em] text-white/40">
              RECENTLY SHIPPED
            </div>
            <div className="space-y-1 opacity-70">{recent.map(row)}</div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
