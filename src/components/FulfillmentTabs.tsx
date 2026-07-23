import Link from "next/link";
import { clsx } from "@/lib/clsx";

const TABS = [
  { href: "/fulfillment", label: "Queue" },
  { href: "/fulfillment/shipped", label: "Shipped" },
  { href: "/fulfillment/eod", label: "End of day" },
] as const;

/** Console section tabs shared by the queue, shipped, and end-of-day pages. */
export function FulfillmentTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <div className="mb-5 flex gap-1.5">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={clsx(
            "rounded-chip px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition",
            t.href === active
              ? "bg-accent text-ink"
              : "border border-white/20 text-white/60 hover:border-accent hover:text-white",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
